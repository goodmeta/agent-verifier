# PLAN — Real AP2 mandate verification (dSD-JWT) — HARDENED v2

Status: hardened against a 3-angle red team (correctness / security / deps). Ready for operator sign-off, then phased execution. Each red-team finding is traced to a section below.

## 0. Why this exists
We mis-modeled AP2 twice (EIP-712, then plain whole-payload JWS — which is actually AP2's *receipt* format). Real AP2 mandates are **dSD-JWT delegation chains** (`draft-gco-oauth-delegate-sd-jwt-00` + RFC 9901): an issuer-signed root SD-JWT plus N KB-SD-JWT hops, each hop signed by the **previous hop's `cnf.jwk`**, hash-chained via `sd_hash`/`issuer_jwt_hash`, ES256/P-256. Grounded in AP2's actual source (`sdjwt/{chain,kb_sd_jwt,common,sd_jwt}.py`, `{payment,checkout}_mandate_chain.py`, `constraints.py`, `mandate.py`, `generated/*`).

## 1. Guiding principle (the synthesis of all three attacks)
**Match AP2's WIRE FORMAT byte-exactly so we accept real tokens; be STRICTER than AP2 on every trust decision.** AP2's reference verifier is permissive in several places (fail-open x5c, optional aud/nonce, caller-supplied linkage hashes, no DoS caps, first-match cnf). We deliberately diverge — fail closed — and document each divergence (§5). Wire-format divergence = we reject valid tokens or accept forged ones; trust-decision strictness = safe.

## 2. Scope
**In (v1, verify-only):** parse + canonicalize a dSD-JWT chain; resolve disclosures (incl. AP2's non-standard `delegate_payload` wrapping + CMWallet inline-digest quirk); verify every signature (ES256, jose); walk `cnf.jwk`; enforce binding hashes (`sd_hash` AND `issuer_jwt_hash`); x5c/kid root trust (fail-closed); typed Payment + Checkout wrappers; port constraint evaluators; self-computed `transaction_id`/`checkout_hash` linkage; receipt-reference helper.
**Explicit non-goals (documented, not silent):** issuing/signing chains; revocation/status lists; **non-ES256 / non-P-256** (AP2's chain is cert-hash-agnostic and could mint P-384 — we reject; stated narrowing, deps-agent §scope); the legacy camelCase `IntentMandate`/`CartMandate` (quarantined as `legacy`, not "AP2").

## 3. Dependencies (audited + reality-checked)
- `@sd-jwt/core` + `@sd-jwt/decode` (+ transitive `@sd-jwt/{types,utils,present}`) — v0.19.0, Apache-2.0, OWF, maintained, high adoption. Used **only** for RFC 9901 disclosure math (`decodeSdJwt`, `unpack`, `getSDAlgAndPayload`, `Disclosure.digest`). **It pins no alg and never resolves header keys** (verified in source) — good, but means alg-pinning is entirely OURS.
- `jose` (already pinned 6.2.3) — **every signature** (root + all hops) via `compactVerify(..., { algorithms: ['ES256'] })`, key supplied out-of-band as a `CryptoKey`/`KeyLike` (never raw bytes an HMAC could eat).
- `crypto.X509Certificate` (node built-in, Node 20+) — x5c: `new X509Certificate(der)`, `.verify(pubKey)` per link, `.checkIssued()`, `.publicKey`, `.validFrom/.validTo`, `.ca`, `.keyUsage`. **Sufficient — no `@peculiar/x509`.**
- **Pin the new transitive `js-base64`** (enters via `@sd-jwt/utils` `^3.7.8`, BSD-3) exactly, per our exact-pin policy.
- Corrections from deps red team: there is **no zod peer dep** on @sd-jwt (claim removed); stay on `0.19.0` exact (ignore `next` tag).

## 4. Verification algorithm — corrected to AP2's real behavior
Each numbered item folds a correctness-agent P0/P1/P4 finding.
1. **Chain split is NOT `split('~~')`.** Port `mandate.py::_canonical_chain_segment`: after splitting on `~~`, for each non-final segment restore a trailing `~` UNLESS it already ends with `~` OR its last `~`-chunk is a 3-part JWT (terminal KB). [P0-1 — the highest-risk omission; without it every binding hash fails.]
2. **`parseToken` enforces 5 rules** (not happy-path split): reject leading `~`; reject no `~`; reject any empty disclosure segment; issuer JWT must be exactly 3 dot-parts; KB detection = token ends with `~` → no kb; else last segment is the kb-JWT and must be 3 dot-parts. `sdJwt = disclosures ? issuer+'~'+join('~')+'~' : issuer+'~'`; `canonical = kb ? sdJwt+kb : sdJwt`. [P0-2]
3. **Root (i=0):** key via `provider(root)` (x5c/kid, §6); verify issuer sig with **jose ES256-pinned**; resolve `delegate_payload[0]`; store verified payload; time-check payload AND each delegate item. [sec-1, P4-21]
4. **Hop i (kb-sd-jwt.verify) — exact order matters:** (a) `typ` ∈ {`kb+sd-jwt`,`kb-sd-jwt`} terminal / {`kb+sd-jwt+kb`,`kb-sd-jwt+kb`} intermediate; (b) verify sig under `prev.cnfJwk()` (jose ES256-pinned); (c) **resolve `delegate_payload` digests FIRST** (CMWallet `_resolve_delegate_payload`); (d) `verifyBinding` (exactly one of `sd_hash`==`computeSdHash(prev)` / `issuer_jwt_hash`==`computeIssuerJwtHash(prev)`; both-present AND both-absent are errors); (e) terminal → enforce aud+nonce (REQUIRED, §5); (f) cnf-presence over `delegate_payload` items: terminal MUST NOT, intermediate MUST; (g) non-terminal → exactly 1 delegate item; (h) time-check payload + items. [P1-8/9/10, P4]
5. **`cnf.jwk` resolution = 3-tier** (`_find_cnf`): delegate_items[*].cnf → verified_payload.delegate_payload[*].cnf → top-level cnf; validated against a **strict JsonWebKey schema** (`extra:forbid`, `kty:'EC'`, `crv:'P-256'`, `alg:'ES256'`, x/y `^[A-Za-z0-9_-]{43}$`). [P0-3, P0-4] + hardening: reject if >1 cnf resolvable, and the chosen cnf's digest MUST be in the issuer-signed `_sd` set (§5). [sec-3]
6. **Binding hashes (byte-exact):** `_hash_ascii(value, sd_alg)` over ASCII bytes; `_sd_alg` map {sha-256/384/512}, default sha-256, unknown → reject. `computeSdHash` over `sdJwt` (no kb); `computeIssuerJwtHash` over `issuerJwt` only; `computeDisclosureDigest` over the disclosure string. Support BOTH binding modes in v1 (`issuer_jwt_hash` is load-bearing for redaction — remove from open questions). [P1-6/7, P4-24]
7. **Typed wrappers:** parse exactly 2 effective payloads `[open, closed]`; run constraints with caller `MandateContext`; **self-compute** `transaction_id`/`checkout_hash` = `b64url(hash_alg(checkout_jwt))` keyed off `_sd_alg`, compare to the closed mandate's value, **mandatory** (absent/mismatch → reject). [P1-5 reconciled with sec-6: AP2 takes these caller-supplied; we self-compute as hardening.]

## 5. Security hardenings OVER AP2's reference (each a deliberate, documented divergence)
| # | AP2 reference behavior | Our hardening | Source |
|---|---|---|---|
| H1 | Defers alg to upstream lib; no pin | Pin ES256 in our jose verifier on **every** sig (root + every hop); reject none/HS256/RS256/swap | sec-1, deps-1a |
| H2 | x5c **fails open** (no roots → accepts self-signed; no validity/CA/keyUsage/name checks) | x5c **fail closed**: `trustedRoots` mandatory; per-cert validity window, `CA:TRUE`+pathLen on non-leaf, keyUsage, issuer/subject name chaining, leaf curve = P-256 | sec-2 |
| H3 | cnf = first-match across 3 tiers; disclosure-injected cnf can win | Require a **single unambiguous** cnf; its digest MUST be in the issuer-signed `_sd` (not an unbound appended disclosure) | sec-3, sec-5 |
| H4 | aud/nonce optional; enforced terminal-only if caller passes | `expectedAud`+`expectedNonce` **required** for any KB-bearing chain (fail closed if absent); doc replay/dedup as caller's job | sec-4, sec-7 |
| H5 | No caps; O(disclosures×digests) re-hashing | Hard caps BEFORE crypto (token bytes, chain depth, disclosures/token, delegate items); precompute digest→value `Map` (O(1) lookup) | sec-8 |
| H6 | Linkage hashes caller-supplied; constraints run vs unverified `checkout_jwt` | Self-compute `transaction_id`/`checkout_hash` from actual bytes; mandatory match; no constraint eval without the tie | sec-6, sec-add |
| H7 | x5c decoded base64url; trusted-root = "last cert signed by a root" (not "root in chain") | Match AP2 here (base64url, anchored-not-present) — wire compat | corr-P3-18 |

Plus §6 checklist invariants (alg pin, no header-key trust, exactly-one binding, typ/cnf, byte-exact canonicalization, time, DoS, mandatory linkage) — all tested.

## 6. Constraints — corrected semantics (port `constraints.py` exactly)
- **Budget.max is major-unit float → `Math.trunc(max*100)` cents**; AmountRange.max/min are integer cents directly (max required, min optional). [P2-11]
- **AgentRecurrence requires BOTH AmountRange and Budget** in the same list (else violation); evaluator is **lifetime `total_uses >= max_occurrences` only** — no frequency/period windowing (present in source, unused). [P2-12/16]
- **Preset payee uses `merchant_matches`** (id-first; else name+website, both must be non-empty); amount/instrument/execution_date use deep equality. [P2-13/14]
- `MandateContext{totalAmount, totalUses, lastUsedDate?}`. [P2-17]
- **LineItems = full bipartite max-flow port** (Dinic/Edmonds-Karp, wildcard = empty acceptable_items, `quantity` = required match count) — **a hard item**, ~150 lines, golden-vector heavily. [P2-15]
- Payee/merchant constraints id-or-name+website; PaymentReference compares caller `openCheckoutHash` to `conditional_transaction_id` (we self-compute openCheckoutHash, H6).

## 7. Test strategy — cross-impl golden vectors (anti-guessing backbone)
- **`test/fixtures/gen_ap2_vectors.py`** uses AP2's `MandateClient.create/present/verify` + conftest-style P-256 key gen (`cryptography` `ec.SECP256R1` → `jwcrypto.JWK`) to mint, as committed JSON (chain string + keys + expected per-hop payloads / expected error): valid 3-hop payment chain, valid checkout chain, and tampered variants per attack class — flipped disclosure, wrong cnf, bad `sd_hash`, reordered-disclosure `sd_hash`, `issuer_jwt_hash`-mode, expired, terminal-with-cnf, intermediate-without-cnf, ambiguous-cnf, alg-swap (none/HS256/RS256) on root/mid/terminal, aud/nonce mismatch, oversized/over-depth. Deps: `cryptography==46.0.5, jwcrypto==1.5.6, pydantic==2.12.5, sd-jwt==0.10.4`, py≥3.11. [deps-3]
- **x5c vectors are hand-built in the generator** via `cryptography.x509` (AP2 helpers only do `kid`) — valid chain-to-root, self-signed (reject), expired (reject), non-CA intermediate (reject), wrong-curve leaf (reject). [deps-3 gap]
- **String-equality assertions separate from digest assertions** (localize a canonicalization bug). [sec-4 binding]
- TS tests load JSON; valid → verify + expected payloads; every tampered → rejected with the right failure class. Unit tests for hash/parse against AP2-emitted (string→digest) pairs (byte-exact). Constraint tests ported from AP2's. DoS tests at each cap boundary.
- Gate per phase: `npm run build && npm test && npm audit`; fresh adversarial review before publish.

## 8. Module layout (`src/ap2/`)
`parse.ts` (canonical-segment restore + full parseToken) · `hash.ts` (sd/issuer/disclosure hashes, _sd_alg) · `jwk.ts` (strict JsonWebKey zod) · `sd-jwt.ts` (root verify via jose + disclosure resolution incl. CMWallet) · `kb-sd-jwt.ts` (hop verify, exact order) · `chain.ts` (split→walk, cnf 3-tier+single, time, caps) · `keys.ts` (x5c fail-closed via X509Certificate + kid) · `types.ts` (zod snake_case mandates + constraints + vct literals) · `constraints.ts` (evaluators incl. max-flow) · `payment-chain.ts`/`checkout-chain.ts` (typed, self-computed linkage) · `index.ts`.

## 9. Phasing (each phase: build → golden-vector → gate → commit; short commit msgs)
- **P0** generator: `gen_ap2_vectors.py` + commit JSON vectors (incl. hand-built x5c). Nothing to verify against without these.
- **P1** `parse.ts` + `hash.ts` + `jwk.ts` — byte-exact vs vectors (string AND digest).
- **P2** `sd-jwt.ts` root verify + disclosure resolution (CMWallet quirk).
- **P3** `kb-sd-jwt.ts` + `chain.ts` — full chain valid/tampered vectors green; caps; cnf single+signed.
- **P4** `keys.ts` x5c fail-closed + kid; x5c vectors green.
- **P5** `types.ts` + `constraints.ts` (incl. max-flow) + `payment/checkout-chain.ts` + receipt-reference.
- **P6** fresh adversarial review → migration/docs → publish v0.5 + `npm deprecate "<0.5"`.

## 10. Migration / honesty
Rename `mandate-jwt.ts` `signMandate`/`verifyMandate` → `signReceipt`/`verifyReceipt` (plain ES256 JWS IS AP2's receipt format — correct, keep). Quarantine camelCase `IntentMandate`/`CartMandate` as `legacy`. README/CHANGELOG: real AP2 mandate verification arrives in v0.5 via dSD-JWT; prior versions did not verify AP2 mandates. Keep policy engine + hosted client unchanged (solid).

## 11. Hardest items (review must focus here)
1. `_canonical_chain_segment` + parseToken byte-exactness (P0-1/2) — breaks everything if wrong.
2. Disclosure resolution incl. AP2's `delegate_payload` wrapping + CMWallet inline digests (must hand-build; @sd-jwt won't).
3. cnf binding-to-signed-content + single-cnf (H3) — the forge-the-next-key vector.
4. x5c fail-closed full validation (H2).
5. LineItems max-flow port (P2-15).

## 12. Open questions — RESOLVED by the red team (kept for the record)
- @sd-jwt vs jose for sig → **jose for all sigs (ES256-pinned); @sd-jwt/decode for disclosure math only.**
- x5c lib → **node `crypto.X509Certificate`, no @peculiar/x509.**
- `issuer_jwt_hash` in v1 → **yes, both modes (load-bearing).**
- DoS caps → **token ≤64KB, depth ≤8, disclosures ≤64/token, delegate items ≤16** (initial; tune).
- fixtures → **generate from AP2 SDK + vendor committed JSON; x5c hand-built.**
