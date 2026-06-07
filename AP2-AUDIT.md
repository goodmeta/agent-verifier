# AP2-AUDIT.md — Conformance audit of `@goodmeta/agent-verifier` vs canonical AP2

**What this is.** A requirement-by-requirement conformance + test-traceability matrix for the
real-AP2 dSD-JWT mandate verifier (v0.5, in progress). Every requirement is pinned to a dated
(commit-hash) version of the canonical AP2 documents and reference implementation, and mapped to
the exact code + test/golden-vector that exercises it, with an honest status.

This is a **living document**: it goes green as build phases P4–P6 land. Today (P0–P3 complete) the
full dSD-JWT chain-mechanics core is covered and validated against 17 golden vectors; mandate semantics,
constraints, linkage, trust-anchoring, and receipts are explicitly marked pending against their phase.

---

## 1. Pinning (primary sources)

| Source | Repo / artifact | Pinned version |
|---|---|---|
| Canonical AP2 spec docs | `github.com/google-agentic-commerce/AP2` → `docs/ap2/*.md` | commit **`e1ea56db72a6385bce3e5c1112b3a56ce60acb43`** |
| AP2 reference implementation (chain algorithm + golden-vector source) | same repo → `code/sdk/python/ap2/sdk/{sdjwt,...}` | same commit |
| Delegate SD-JWT chain algorithm | `draft-gco-oauth-delegate-sd-jwt-00` (G. Oliver), **referenced** by AP2 but NOT vendored in the repo at this commit | pinned indirectly via the AP2 SDK reference impl above |
| This verifier | `github.com/goodmeta/agent-verifier` | commit **`c6b79d6`** (P0–P2) |
| Audit date | — | 2026-06-07 |

**Why two pins for one spec.** AP2's core verification step is *"Verify and process the SD-JWT chain
according to [Delegate SD-JWT]"* (`agent_authorization.md` §"Verification and Processing Rules",
confirmed verbatim at `e1ea56d`). That draft's text is not in the AP2 repo, so the **authoritative,
pinnable encoding of the chain algorithm is the AP2 Python SDK at the same commit** — which is also
exactly what mints our golden vectors. Auditing against the SDK is auditing against AP2's *actual
behavior*, not a paraphrase of a draft.

## 2. Methodology — how each requirement is "tested"

1. **Requirements** were extracted from the canonical docs at `e1ea56d` by six independent reads
   (`specification.md`, `agent_authorization.md`, `payment_mandate.md`, `checkout_mandate.md`,
   `security_and_privacy_considerations.md`, `implementation_considerations.md`). Heavily
   cross-validated (vct exact-match, `sd_hash` binding, `cnf`-required-when-open, unknown-constraints-fail
   each appear across ≥3 reads). The 3-step verification spine was confirmed verbatim against primary
   source. Per-doc requirement IDs (`SPEC-*`, `AUTH-*`, `PAY-*`, `CHK-*`, `SEC-*`, `IMPL-*`) are cited
   in the **Spec refs** column.
2. **Golden vectors** (`test/fixtures/ap2-vectors.json`, `ap2-hash-pairs.json`) are minted by AP2's
   own SDK at `e1ea56d`. A requirement is **COVERED** only when a TypeScript test asserts our output
   equals AP2's bytes (string AND digest), or asserts the documented rejection.
3. **The port is line-for-line** against the AP2 SDK (and, for disclosure math, the Python `sd_jwt`
   lib the SDK actually calls). Faithfulness to AP2's *actual behavior* is the design rule; we diverge
   only to be **stricter on trust decisions** (the 🔒 rows), each documented.

## 3. Status legend

| Code | Meaning |
|---|---|
| ✅ **COVERED** | Implemented + a passing test asserts it against AP2's golden vectors |
| 🔒 **HARDENED** | We are deliberately **stricter than AP2** (documented divergence, PLAN §5 H1–H7) |
| ⏳ **PENDING-Pn** | Planned in phase *n* (PLAN-AP2.md §9); not yet implemented |
| 📋 **CALLER** | Verifier surfaces the data; enforcement is the integrator's responsibility (documented) |
| ⛔ **OUT-OF-SCOPE** | Not a verify-only-verifier concern (issuer/agent/UX/architecture) |

A row may carry two codes (e.g. `🔒 ⏳P3` = a hardening planned for P3).

---

## 4. Layer 1 — dSD-JWT chain mechanics (Delegate SD-JWT, via AP2 SDK @ `e1ea56d`)

These are sourced from the AP2 SDK reference impl (`sdjwt/{common,sd_jwt,kb_sd_jwt,chain}.py`) — the
authoritative encoding of the referenced Delegate SD-JWT algorithm.

| # | Requirement | Spec refs | Our handling | Test / vector | Status |
|---|---|---|---|---|---|
| L1-1 | Chain compact form is `~~`-joined segments; each non-final segment's trailing `~` (consumed by the join) MUST be restored unless it already ends `~` or ends in a 3-part KB-JWT (`_canonical_chain_segment`) | SDK `mandate.py` | `parse.ts` `canonicalChainSegment` / `splitChain` | `parse-hash.test.ts` "byte-exact canonicalization" | ✅ |
| L1-2 | `parse_token` enforces: reject leading `~`; reject no `~`; reject empty disclosure segment; issuer JWT exactly 3 dot-parts; KB detection (ends `~` → none, else last segment is 3-part KB-JWT) | SDK `common.py::parse_token` | `parse.ts` `parseToken` (5 rules) | `parse-hash.test.ts` "rejects malformed tokens" | ✅ |
| L1-3 | Canonical SD-JWT string = `issuer + '~' + disclosures.join('~') + '~'` (no KB); `canonical` appends KB-JWT when present | SDK `common.py` `sd_jwt`/`canonical` | `parse.ts` (`sdJwt`,`canonical`) | `parse-hash.test.ts` byte-exact `sdJwt`/`canonical` | ✅ |
| L1-4 | Binding/digest hash = base64url(no-pad) of the **ASCII** bytes of the on-wire string, algorithm by `_sd_alg` (default `sha-256`; unknown ⇒ reject) | IMPL-01/02; SDK `common.py::_hash_ascii` | `hash.ts` `hashAscii` + `_sd_alg` map | `parse-hash.test.ts` "sd_hash / issuer_jwt_hash / disclosure digests byte-exact" | ✅ |
| L1-5 | `sd_hash` over `sd_jwt` (incl. disclosures, no KB); `issuer_jwt_hash` over the issuer JWT only; disclosure digest over the disclosure string | AUTH-6; SDK `common.py` | `hash.ts` `computeSdHash`/`computeIssuerJwtHash`/`computeDisclosureDigest` | `parse-hash.test.ts` (byte-exact, all three) | ✅ |
| L1-6 | Root issuer-JWT signature verifies (ES256) under the issuer key; resolve `delegate_payload` disclosures | AUTH-14 step 1; SDK `sd_jwt.py::verify` | `sd-jwt.ts` `verifyRootSdJwt` (jose `compactVerify({algorithms:['ES256']})`) | `sd-jwt.test.ts` valid_payment_2hop ✅, tampered_root_payload reject, wrong_root_key reject | ✅ |
| L1-7 | Standard RFC 9901 disclosure unpack: `{"...":digest}` array elements + `_sd:[digest]` object members; strip `_sd`/`_sd_alg`; reject duplicate disclosure hashes, duplicate `_sd` digests, duplicate disclosed keys; `sha-256` only | SDK `sd_jwt` lib `_unpack_disclosed_claims` | `sd-jwt.ts` `resolveDisclosures`/`unpack` (line-for-line port of the Python lib) | `sd-jwt.test.ts` expectedPayloads[0] deepEqual; non-sha-256 reject; duplicate-hash reject | ✅ |
| L1-8 | AP2 `delegate_payload` resolution: inline a delegate item's own object-property `_sd` (`_inline_sd_claims`); decode bare-string items | SDK `chain.py::_resolve_delegate_items` | `sd-jwt.ts` `resolveDelegateItems` | `sd-jwt.test.ts` valid_payment_2hop (root item == AP2) | ✅ |
| L1-9 | CMWallet quirk: `delegate_payload` items that are bare digest **strings** resolve in place to the matching disclosure's dict value | SDK `kb_sd_jwt.py::_resolve_delegate_payload` | `sd-jwt.ts` `resolveDelegatePayload` | `sd-jwt.test.ts` "bare digest string resolves" / "unmatched untouched" | ✅ |
| L1-10 | KB hop `typ` ∈ {`kb+sd-jwt`,`kb-sd-jwt`} (terminal) / {`kb+sd-jwt+kb`,`kb-sd-jwt+kb`} (intermediate) | SDK `kb_sd_jwt.py::TYP_*` | `kb-sd-jwt.ts` `verifyKbHop` | `chain.test.ts`: 2hop terminal + 3hop intermediate accepted; `wrong_typ` ⇒ reject (right reason) | ✅ |
| L1-11 | KB hop signature verifies (ES256) under the **previous hop's `cnf.jwk`** | SPEC-11; AUTH-3/4; SDK `kb_sd_jwt.py::verify` | `kb-sd-jwt.ts` (jose ES256) + `sd-jwt.ts` `cnfJwk` | `chain.test.ts` `wrong_cnf_key` ⇒ reject (signature) | ✅ |
| L1-12 | Binding: **exactly one** of `sd_hash`/`issuer_jwt_hash` present and equal to the computed hash of `prev`; both-present AND both-absent are errors | AUTH-5; SDK `common.py::verify_binding` | `kb-sd-jwt.ts` `verifyBinding` | `chain.test.ts`: `binding_sd_hash_mismatch` + `both_binding_claims` + `neither_binding_claim` ⇒ reject; `..._issuer_jwt_hash` ⇒ valid (both modes) | ✅ |
| L1-13 | `cnf` resolution is 3-tier (`_find_cnf`): delegate_items[*].cnf → verified_payload.delegate_payload[*].cnf → top-level `cnf`; jwk validated strict EC P-256 | AUTH-3; SDK `common.py::_find_cnf`/`cnf_jwk` | `jwk.ts` (strict schema); `sd-jwt.ts` `cnfJwk` (3-tier) | `jwk.test.ts` + `chain.test.ts` 3hop (cp resolved from agent hop's cnf) | ✅ |
| L1-14 | Terminal hop MUST NOT carry `cnf`; intermediate hop MUST carry `cnf`; non-terminal resolves exactly 1 delegate item | SDK `kb_sd_jwt.py::verify` | `kb-sd-jwt.ts` `delegatePayloadHasCnf` | `chain.test.ts`: valid terminal-no-cnf + intermediate-cnf; `terminal_with_cnf` + `intermediate_without_cnf` ⇒ reject (right reason) | ✅ |
| L1-15 | `exp`/`iat` time checks per token + per delegate item (clock-skew window) | AUTH-24; SDK `chain.py::_check_time_claims` | `chain.ts` `checkTimeClaims` | `chain.test.ts`: iat checked on every hop; `expired` ⇒ reject | ✅ |
| L1-16 | Chain walk: root via key provider; hop *i* via hop *i-1* `cnf.jwk`; returns per-hop effective payloads `[open, …, closed]` | AUTH-14; SDK `chain.py::verify_chain` | `chain.ts` `verifyChain` | `chain.test.ts` 2hop ⇒ `[open,payment]`, 3hop ⇒ `[open,open,payment]`, byte-exact vs AP2 | ✅ |

The only L1 negative still deferred is **disclosure-reorder** (a reordered ≥2-disclosure segment breaking `sd_hash`). It needs a multi-disclosure root (`DisclosureMetadata` surgery); meanwhile it is covered indirectly by `binding_sd_hash_mismatch` (binding rejection) plus the P1 byte-exact `sd_hash`-over-ordered-disclosures test. Tracked for a later vector.

## 5. Layer 1′ — hardenings OVER AP2 chain mechanics (stricter on trust)

| # | Hardening (PLAN §5) | What AP2 does | Our stricter behavior | Status |
|---|---|---|---|---|
| H1 | **Alg pin** | Defers `alg` to upstream lib; examples show ES256 but no exclusivity stated (SPEC-2, IMPL-32/40) | Pin **ES256** (`{algorithms:['ES256']}`) in `sd-jwt.ts` `verifyEs256` on **every** signature (root + every hop); reject none/HS256/RS256 | 🔒 ✅ (`alg_swap_none_root` + `alg_swap_hs256_hop` ⇒ reject) |
| H2 | **x5c fail-closed** | x5c chain check **fails open** when no trusted roots configured | `trustedRoots` mandatory; per-cert validity, CA+pathLen, keyUsage, name chaining, leaf curve = P-256 | 🔒 ⏳P4 |
| H3 | **Single, signed cnf** | First-match across 3 tiers; a disclosure-injected `cnf` can win | `sd-jwt.ts` `cnfJwk`: reject if >1 delegate item carries a `cnf` (`chain.test.ts` H3). AP2 first-matches, so no AP2-confirmed vector — guard asserted directly. Signed-`_sd` digest-binding refinement ⏳ | 🔒 ✅ (guard) / refinement ⏳ |
| H4 | **aud+nonce required** | Optional; enforced terminal-only if caller passes them | `chain.ts`: `expectedAud`+`expectedNonce` **required** for any KB-bearing chain (fail closed if absent) | 🔒 ✅ (`chain.test.ts` H4) |
| H5 | **DoS caps** | No caps; O(disclosures×digests) rehash | `chain.ts` `enforceCaps` before crypto (depth ≤8, token ≤64KB, disclosures ≤64/token); digest→value `Map` in unpack | 🔒 ✅ (`chain.test.ts` H5 depth; byte/disclosure caps implemented) |
| H6 | **Self-computed linkage** | `transaction_id`/`checkout_hash` taken caller-supplied | Self-compute from actual bytes; mandatory match; no constraint eval without the tie | 🔒 ⏳P5 |
| H7 | **x5c anchored-not-present** | trusted root = "last cert signed by a configured root" | Match AP2 here (wire-compat): anchor by signature, root need not be in the chain | (parity, P4) ⏳P4 |

## 6. Layer 2 — AP2 mandate semantics (on top of the chain)

| # | Requirement | Spec refs | Our handling | Test / vector | Status |
|---|---|---|---|---|---|
| L2-1 | Open Mandate MUST carry the agent key as a `cnf` claim (it isn't yet transaction-bound) | SPEC-10; AUTH-2; SEC-04; PAY-16; IMPL-12 | `chain.ts` cnf resolution (L1-13) + `types.ts` (cnf required-when-open) | vector valid_payment_2hop (root has cnf); open-without-cnf reject | ⏳P3/P5 |
| L2-2 | `vct` is REQUIRED and identifies the mandate type | AUTH-1; SPEC-17; IMPL-34 | `types.ts` zod (vct required) | types unit tests | ⏳P5 |
| L2-3 | **Exact** `vct` match incl. version suffix: `mandate.payment.1` / `mandate.payment.open.1` / `mandate.checkout.1` / `mandate.checkout.open.1` | SPEC-14/15/16; PAY-01/02/03; CHK-01/02; IMPL-08/09/10 | `types.ts` vct literals (no prefix/loose match) | vct-mismatch reject vector | ⏳P5 |
| L2-4 | Verify closed Mandate Content leaves open Mandate claim values **unchanged** (step 2) | SPEC-38; AUTH-14; IMPL-16; PAY-19 | `payment-chain.ts`/`checkout-chain.ts` open↔closed diff | open-altered-by-closed reject vector | ⏳P5 |
| L2-5 | An open mandate need not have all closed-type required fields, but the closed one MUST | SPEC-41 | `types.ts` (open vs closed schemas) | types unit tests | ⏳P5 |
| L2-6 | Closed Payment Mandate fields: `vct`,`transaction_id`,`payee{id,name,website}`,`payment_amount{amount:int,currency}`,`payment_instrument{id,type,description}` | SPEC-19; PAY-04..08 | `types.ts` payment schema | types unit tests vs vector payload | ⏳P5 |
| L2-7 | Closed Checkout Mandate fields: `vct`,`checkout_hash`,`checkout_jwt` (merchant-signed; payload out of AP2 scope) | SPEC-18; CHK-05/07 | `types.ts` checkout schema | checkout vector | ⏳P5 |

## 7. Layer 3 — Constraints (closed-world; unknown ⇒ FAIL)

Step 3 of the verification rule. **Critical fail-closed:** *"Any unknown Constraints MUST be treated
as failing evaluation"* (AUTH-15 / SPEC-39 / IMPL-17/37, confirmed verbatim). The legacy `policy.ts`
engine is a **different, non-AP2** model and is quarantined — it does not satisfy these.

| # | Constraint / rule | Spec refs | Our handling (`constraints.ts`, P5) | Test / vector | Status |
|---|---|---|---|---|---|
| L3-0 | **Unknown constraint type ⇒ evaluation fails** (no silent skip) | AUTH-15; SPEC-39; IMPL-17/37 | `constraints.ts` default-deny dispatch | unknown-constraint reject vector | ⏳P5 |
| L3-1 | `payment.budget`: requested + Σ prior-closed ≤ `max`; accumulate after approval (stateful) | SPEC-26; PAY-25; IMPL-23 | evaluator + `MandateContext{totalAmount}`; cross-presentation total is 📋 caller | budget vectors | ⏳P5 / 📋 |
| L3-2 | `payment.amount_range`: amount within [`min`,`max`]; `currency` matches | SPEC-27; PAY-24; IMPL-27 | evaluator (major-unit float ⇒ `trunc(max*100)` cents) | amount-range vectors | ⏳P5 |
| L3-3 | `payment.agent_recurrence`: lifetime `total_uses ≥ max_occurrences`; requires AmountRange+Budget present | SPEC-28; PAY-26 | evaluator (lifetime-only; frequency windowing unused, per SDK) | recurrence vectors | ⏳P5 |
| L3-4 | `payment.allowed_payees`: `payee` ∈ `allowed` (id-first, else name+website) | SPEC-29; PAY-21; IMPL-24 | `merchant_matches` evaluator | payee vectors | ⏳P5 |
| L3-5 | `payment.allowed_payment_instruments`: `payment_instrument` ∈ `allowed` | SPEC-30; PAY-22; IMPL-25 | deep-equality evaluator | instrument vectors | ⏳P5 |
| L3-6 | `payment.allowed_pisps`: facilitating PISP ∈ `allowed` (legal/brand/domain) | SPEC-31; PAY-23; IMPL-26 | evaluator | pisp vectors | ⏳P5 |
| L3-7 | `payment.reference`: closed checkout's delegate chain contains an open Checkout Mandate with matching hash; algo = `_sd_alg`/`sha-256` | SPEC-32; PAY-27/28; IMPL-22/30 | self-computed `openCheckoutHash` vs `conditional_transaction_id` (H6) | reference vectors | ⏳P5 / 🔒 |
| L3-8 | `payment.execution_date`: within [`not_before`,`not_after`] (ISO 8601) | SPEC-33; PAY-29; IMPL-28 | date evaluator (NaN ⇒ reject, no fail-open) | execution-date vectors | ⏳P5 |
| L3-9 | `checkout.allowed_merchants`: merchant ∈ **revealed** elements of `allowed`; no revealed ⇒ invalid | SPEC-36; CHK-12; IMPL-29 | evaluator over revealed disclosures | merchant vectors | ⏳P5 |
| L3-10 | `checkout.line_items`: bipartite **max-flow** match; each item used once; flow == both totals | SPEC-37; CHK-14/15 | `constraints.ts` max-flow (Dinic/Edmonds-Karp port of `max_flow_helper.py`) | line-items vectors (incl. wildcard, quantity) | ⏳P5 |

## 8. Layer 4 — Linkage & receipts

| # | Requirement | Spec refs | Our handling | Test / vector | Status |
|---|---|---|---|---|---|
| L4-1 | `checkout_hash` = base64url hash of `checkout_jwt`; algo = `_sd_alg`/`sha-256`; **independently computed**, not trusted | SPEC-4/5/9; AUTH-22; CHK-05/06; SEC-06; IMPL-21/31 | hash primitive ✅ (`hash.ts`); self-compute wrapper (H6) in `checkout-chain.ts` | checkout linkage vector | hash ✅ / linkage ⏳P5 🔒 |
| L4-2 | `transaction_id` binds the Payment Mandate to its Checkout (= hash of checkout JWT) | SPEC-19; PAY-08/09; SEC-02/08 | `payment-chain.ts` self-computed linkage (H6) | linkage vector | ⏳P5 🔒 |
| L4-3 | Non-deterministic signature for the checkout/payment (ECDSA, **not** Ed25519) so the hash resists rainbow-tabling | SPEC-3; PAY-10; SEC-22; IMPL-11 | ES256 pin (= ECDSA) on every sig (H1) | covered transitively by H1 | root ✅ / hops ⏳P3 🔒 |
| L4-4 | Mandate Receipt `reference` = base64url hash of the **final** SD-JWT in the chain, computed like `sd_hash` (`_sd_alg`/`sha-256`) | SPEC-6; AUTH-17; CHK-27; IMPL-18 | hash primitive ✅; `get_closed_mandate_jwt`-style selection + helper | receipt-reference vector | hash ✅ / helper ⏳P5 |
| L4-5 | Dispute: Checkout/Payment Receipt `reference` MUST match the hash of the closed mandate; recompute from bytes | SPEC-7/8/43; IMPL-19/20; PAY-33 | receipt-reference helper (recompute, never trust) | dispute-reference vector | ⏳P5 📋 |
| L4-6 | Mandate Receipt is a Verifier-signed JWT (`iss`=verifier, `result`∈{success,error}, `reference`, opt `error*`) | SPEC-20; AUTH-18; IMPL-38 | Receipt **signing** is the hosted/pro side; OSS verify-lib provides the reference helper only | — | 📋 / ⛔ (issuing) |

## 9. Layer 5 — Trust anchoring & algorithms

| # | Requirement | Spec refs | Our handling | Test / vector | Status |
|---|---|---|---|---|---|
| L5-1 | Root signer trust: User-Credential issuer (`kid`/`iss`) **or** Trusted Agent Provider key; verifier trusts the anchor | SPEC-23; AUTH-12/13 | `keys.ts` x5c/kid provider; key supplied out-of-band (never header-`jwk`-trusted) | kid-lookup + x5c vectors | ⏳P4 / 🔒(H2) |
| L5-2 | EC **P-256** keys for `cnf.jwk` / signing (only curve shown) | SPEC-46; AUTH-3 | `jwk.ts` strict `kty:EC, crv:P-256, x/y 43-char, no extra members` | `jwk.test.ts` accept real / reject curve/kty/x/smuggle | ✅ |
| L5-3 | ES256 throughout (only alg shown; not locked exclusive by spec) | SPEC-2; AUTH-8; IMPL-32/40 | We pin ES256 (H1) — stricter than AP2's silence | root ✅ / hops ⏳P3 | 🔒 root ✅ |
| L5-4 | Validation/processing MUST be deterministic code (LLMs/agents are attackers) | SPEC-24; AUTH-20; IMPL-13/39 | The entire verifier is deterministic TS (no model in the verify path) | architectural — whole library | ✅ |

## 10. Out-of-scope for a verify-only verifier (documented, not silently dropped)

| # | Requirement | Spec refs | Why out-of-scope here | Disposition |
|---|---|---|---|---|
| O-1 | Shopping Agent MUST NOT present a new open mandate before a rejection receipt; CP/Network/MPP MAY reject overlapping mandates | SPEC-22; SEC-13/14/16; IMPL-06 | Double-spend prevention is **presenter/issuer + caller dedup**, not single-mandate verification | 📋 CALLER (replay/dedup is caller's job; noted in H4) |
| O-2 | Receipts MUST be integrity-protected from the agent's LLM | SEC-15 | Agent-side handling of receipts | ⛔ |
| O-3 | Present only the disclosures needed (selective-disclosure minimization) | SPEC-40; SEC-17; PAY-35; IMPL-07 | **Presenter** (agent) behavior; a verifier accepts whatever minimal set still verifies | ⛔ |
| O-4 | `exp` SHOULD be the smallest task-completing value; decoy digests MAY be added | AUTH-24; SPEC-34; SEC-18 | **Issuer** behavior | ⛔ |
| O-5 | Agent Provider MUST protect its signing key from the agent | AUTH-13; IMPL-35 | **Issuer infra** | ⛔ |
| O-6 | SD-JWT digests MUST include sufficient-entropy salt | SEC-20/23 | **Issuer** salting; a verifier cannot prove entropy. We enforce ES256 (sig entropy) for the checkout_hash case | ⛔ / partially via H1 |
| O-7 | Trusted Surface non-agentic; mandate management / user notifications | SPEC-24; IMPL-13/36 | **Architecture / agent UX** | ⛔ |
| O-8 | MPP MUST verify the payment credential is scoped to the checkout (token release) | SPEC-49; SEC-10; PAY-38 | **Payment-rail / MPP** concern downstream of mandate verification | ⛔ |
| O-9 | Issuing / signing mandates; revocation/status lists; non-ES256 / non-P-256 | PLAN §2 non-goals | Verify-only scope; non-ES256/P-256 deliberately **rejected** (stated narrowing) | ⛔ (reject) |

---

## 11. Coverage summary (as of `ff51904`, P0–P3 complete)

| Layer | Total reqs | ✅ COVERED | 🔒 hardened (now) | ⏳ pending (phase) | 📋/⛔ |
|---|---|---|---|---|---|
| L1 chain mechanics | 16 | 16 (L1-1…L1-16) | H1 root+hops | disclosure-reorder vector (see L1 note) | — |
| L1′ hardenings | 7 | — | H1 ✅, H3 ✅(guard), H4 ✅, H5 ✅ | H2 →P4, H6 →P5, H7 →P4; H3 signed-`_sd` refinement | — |
| L2 mandate semantics | 7 | — | — | 7 → P5 | — |
| L3 constraints | 11 | — | H6 | 11 → P5 | budget total 📋 |
| L4 linkage & receipts | 6 | hash primitives | H6 | wrappers → P5 | L4-6 📋/⛔ |
| L5 trust & alg | 4 | 2 (L5-2, L5-4) | H1 | x5c → P4 (H2) | — |
| O out-of-scope | 9 | — | — | — | 9 |

**Done (P0–P3 complete):** canonical chain split/parse; ASCII binding-hash math; strict EC-P256 JWK; full
disclosure resolution (standard unpack + delegate-item inline + CMWallet); root **and hop** ES256
signature verify; full chain walk with `cnf` hop-chaining, exactly-one `sd_hash`/`issuer_jwt_hash` binding
(both modes), terminal aud/nonce, single-`cnf` guard (H3), aud+nonce-required (H4), DoS caps (H5).
Validated by **17 golden vectors**: 3 valid (2-hop, 3-hop, issuer_jwt_hash) byte-exact vs AP2; 14 reject
(6 base + 8 hand-built negatives: wrong-typ, both/neither binding, terminal-with-cnf,
intermediate-without-cnf, expired, alg-swap none/HS256) — every reject AP2-confirmed at mint and
**reason-pinned** in the TS test so each fails for its intended check. (67 tests total.)

**Next to green:** P4 (x5c fail-closed, H2/H7) and P5 (vct exact-match, open↔closed unchanged, 8+2
constraints incl. line-items max-flow, linkage self-compute H6, receipt-reference). Deferred minor
items: disclosure-reorder vector (L1 note); H3 signed-`_sd` digest-binding refinement.

## 12. Re-audit / reproduce

1. Confirm the AP2 pin: `pip install "git+https://github.com/google-agentic-commerce/AP2.git@e1ea56db72a6385bce3e5c1112b3a56ce60acb43"` (PEP 610 `direct_url.json` records the commit).
2. Regenerate golden vectors from that SDK: `/tmp/ap2venv/bin/python test/fixtures/gen_ap2_vectors.py` (deterministic-key seeding lands in P3 so re-runs don't churn).
3. Gate: `npm run build && npm test && npm audit`.
4. Re-extract requirements from `docs/ap2/*.md` at the pinned commit and diff this matrix.

**Faithfulness rule (operator directive, 2026-06-07):** keep the golden vectors and the line-for-line
port of AP2's Python algorithm — 100% faithful to AP2's *actual behavior*. Divergence is allowed only
to be **stricter on trust** (the 🔒 rows), and each such divergence is documented here and in PLAN §5.
