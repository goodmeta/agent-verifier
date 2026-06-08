# HANDOFF — 2026-06-08 (UTC)

## TL;DR
- **Stage:** real AP2 dSD-JWT mandate verifier, v0.5. **P0–P5 COMPLETE.** Only P6 (review + publish) remains.
- **Last shipped:** `6a05668` — AP2-AUDIT.md updated to P5-complete. Whole verifier is built + validated byte-exact vs AP2's SDK at pinned commit `e1ea56d`. Gate: build clean, 123 tests, 0 vulns.
- **Next:** P6 migration/docs + index wiring — rename `signMandate`→`signReceipt`, wire `src/ap2/*` into `index.ts`, README/CHANGELOG, bump to 0.5.0. THEN fresh adversarial review (GOOD TO GO gate) → publish (operator-approved only).

## Where we are
The entire dSD-JWT verifier is built and golden-vector-validated. Phases:

| Phase | Status | Pass criterion |
|---|---|---|
| P0 generator + payment vectors | ✅ | real AP2 chains minted → committed JSON |
| P1 parse / hash / jwk | ✅ | byte-exact vs AP2 (string AND digest) |
| P2 sd-jwt root verify + disclosure resolution | ✅ | resolves root payload == AP2's expectedPayloads[0] |
| P3 kb-sd-jwt + chain (+ 8 hand-built negatives) | ✅ | valid 2/3-hop + issuer_jwt_hash byte-exact; 14 reject vectors reject, reason-pinned |
| P4 x5c fail-closed + kid | ✅ | trusted-root mandatory; validity/CA/curve/anchor; 6 x5c vectors (4 AP2-confirmed-accept hardenings) |
| P5 types + constraints (max-flow) + wrappers + linkage + receipt-ref | ✅ | byte-exact violations vs AP2; H6 self-compute; receipt ref byte-exact |
| P6 review → docs/migration → publish v0.5 | ⏳ NEXT | review GOOD TO GO; operator publishes |

Gate now: `npm run build` (tsc clean), `npm test` (123/123), `npm audit` (0 vulns).

**65 golden vectors** across 5 JSON files, all validated vs AP2's reference SDK:
- `ap2-vectors.json` (23): 3 valid chains + 14 chain rejects + 6 x5c
- `ap2-hash-pairs.json`: P1 byte-exact parse/hash ground truth
- `ap2-constraint-vectors.json` (24 payment) + `ap2-checkout-constraint-vectors.json` (11 checkout)
- `ap2-linkage-vectors.json` (3 checkout-chain + 4 receipt-reference)

## Mandatory rules (do not skip)
- **Match AP2's WIRE FORMAT byte-exact; be STRICTER than AP2 on trust decisions** (PLAN-AP2.md §1, §5 H1–H7, all live). Every divergence is a documented hardening in AP2-AUDIT.md.
- **Golden vectors from AP2's own SDK (commit `e1ea56d`) are the source of truth.** Validate every change against `test/fixtures/ap2-*.json`. The faithfulness directive (operator, 2026-06-07): "keep golden vectors and line-for-line port of AP2's Python algorithm — 100% faithful to AP2's actual behavior. This is supremely important."
- **Pin ES256 in OUR jose callback on every signature** (`sd-jwt.ts` `verifyEs256`); `@sd-jwt/*` is NOT used (native port — see PLAN §3 deviation).
- **Never claim "shipped"/"ready" without the gate:** `npm run build && npm test && npm audit`.
- **Never `git push` or `npm publish` without explicit operator approval.** Nothing is pushed; npm is still at 0.2.0 (the old EIP-712 version).
- **Exact dependency pins** (no `^`/`~`): jose 6.2.3, zod 4.4.3, @types/node 20.19.42, tsx 4.21.0, typescript 5.9.3. No new runtime deps added P2–P5.
- **No `Co-Authored-By` in commits; short commit messages** (operator preference).
- Global: sanity-check-before-recommending; no-overclaim (applies to our OWN docs — e.g. corrected the "deterministic vectors" overclaim); verify-claims; show-don't-ship for any public protocol-repo post.

## Active task list (snapshot — IDs don't survive sessions)
- **[in_progress]** agent-verifier v0.5: P6 migration/docs + index wiring (rename receipt fns, wire `src/ap2/*` public API, README/CHANGELOG, 0.5.0).
- [pending] P6 fresh adversarial review of the whole v0.5 verifier — GOOD TO GO is the publish gate.
- [pending] P6 publish v0.5 + `npm deprecate "<0.5"` — operator-approved only.
- [pending] Discharge aeoess #98 (crosswalk `release`-cell PR + comment) — show-don't-ship; was BLOCKED on v0.5 publish.
- [pending] Two deferred verifier items: disclosure-reorder vector (needs multi-disclosure root); H2 basic-keyUsage/pathLen (node `X509Certificate` doesn't expose them).

## Task rehydration — run these first in a new session
```json
{
  "subject": "agent-verifier v0.5: P6 migration/docs + index wiring",
  "activeForm": "Doing P6 migration/docs + index wiring",
  "description": "P0-P5 COMPLETE + committed (HEAD 6a05668). Do P6 non-publish work: (1) rename src/mandate-jwt.ts signMandate/verifyMandate -> signReceipt/verifyReceipt (plain ES256 JWS IS AP2's RECEIPT format, not its mandate format — verified P2); update index.ts export + the doc comment. (2) Wire the new AP2 verifier into the public API: export from index.ts the dSD-JWT surface — verifyChain (chain.ts), x5cOrKidProvider (keys.ts), splitChain (parse.ts), checkPaymentConstraints/checkCheckoutConstraints (constraints.ts), parsePaymentChain/verifyPaymentChain/parseCheckoutChain/verifyCheckoutChain/receiptReference (chains.ts), and the zod schemas/types (types.ts). Decide a clean namespace (e.g. export * as ap2, or named exports). (3) Quarantine legacy camelCase IntentMandate/CartMandate as 'legacy' (they are the OLD non-AP2 model). (4) README + CHANGELOG: real AP2 mandate verification arrives in v0.5 via dSD-JWT; prior versions did NOT verify AP2 mandates. (5) bump package.json 0.4.0 -> 0.5.0. Keep policy.ts + client.ts UNCHANGED (solid, non-AP2). GATE each step: npm run build && npm test && npm audit. SUCCESS: tsc clean, 123/123 tests, 0 vulns, public API exports the AP2 verifier. Do NOT publish."
}
```
```json
{
  "subject": "P6 fresh adversarial review of v0.5 verifier",
  "activeForm": "Running fresh adversarial review of v0.5",
  "description": "AFTER P6 migration/docs done. Run a fresh full adversarial review of the whole src/ap2/* verifier (parse, hash, jwk, sd-jwt, kb-sd-jwt, chain, keys, types, constraints, max-flow, chains) + the public API. Focus PLAN-AP2.md §11 hardest items: canonical-segment+parse byte-exactness, disclosure resolution + CMWallet, cnf-bound-to-signed-content (H3 signed-_sd refinement still pending), x5c fail-closed (H2 keyUsage/pathLen gap), LineItems max-flow. Also re-verify no trust-decision fails open. Output GOOD TO GO or a fix list. This is the publish gate. Use subagents."
}
```
```json
{
  "subject": "Publish agent-verifier v0.5 (operator-approved)",
  "activeForm": "Publishing v0.5",
  "description": "ONLY after review returns GOOD TO GO AND operator explicitly approves. npm publish v0.5 + npm deprecate '<0.5'. Then discharge aeoess #98 (crosswalk budget_reservation.yaml goodmeta 'release' cell PR + #98 follow-up; show-don't-ship: 5-perspective council, stage gh, operator posts)."
}
```

## What changed this session (chronological, latest first)
- `6a05668` AP2-AUDIT P5 complete — L2/L3/L4 + H6 covered byte-exact, 65 vectors. WHY: keep the conformance matrix truthful as each phase lands.
- `c0b6a9b` **P5c** typed payment/checkout chain wrappers + H6 self-computed linkage + receipt-reference. WHY: ties the chain walk to typed mandates + constraints; H6 catches a tampered checkout_hash AP2 itself accepts.
- `e7f95e9` **P5b** checkout constraints + line-items bipartite max-flow (Dinic port). WHY: PLAN's hardest item; byte-exact incl. complex/wildcard cases.
- `b22202c` **P5a** payment types + 8 constraint evaluators (vct exact, unknown-fails). WHY: byte-exact violation strings vs AP2 (22/24 exact, 2 Python-repr → count).
- `a50beb2` / `a205d9b` **P4** x5c fail-closed trust anchoring (keys.ts) + 6 vectors (4 AP2-confirmed-accept hardenings). WHY: AP2's x5c fails open; we fail closed.
- `d7be36c` / `ff51904` **P3 negatives** — 8 hand-built reject vectors + H3 guard, reason-pinned, AP2-confirmed. WHY: close the L1 negative-path footnotes; each rejects for its intended check.
- `65b21d6` / `ece17aa` / `baf1ed8` **P3 core** kb-sd-jwt + chain walk + 3-hop/issuer_jwt_hash vectors. WHY: the security-critical chain walker, cnf hop-chaining, H3/H4/H5.
- `3619758` **AP2-AUDIT.md** created — conformance matrix pinned to `e1ea56d`. WHY: operator asked for a doc that tests each AP2 requirement against the verifier.
- `c6b79d6` **P2** root SD-JWT verify + disclosure resolution (native port, no @sd-jwt). WHY: native port mirrors AP2's actual Python `sd_jwt` lib (the TS @sd-jwt lib could diverge).

## Open known issues
- **Deferred: disclosure-reorder vector** — needs a multi-disclosure root via `DisclosureMetadata` surgery. Covered indirectly by `binding_sd_hash_mismatch` + P1 byte-exact sd_hash. (AP2-AUDIT §4 note.)
- **Deferred: H2 basic-keyUsage / pathLen not enforced** — node `X509Certificate` exposes only EXTENDED key usage (`.keyUsage` is undefined for basic KeyUsage). `keys.ts` relies on `.ca` (CA:TRUE) for the CA constraint; documented in `keys.ts` + AP2-AUDIT H2.
- **Deferred: H3 signed-`_sd` digest-binding refinement** — `cnfJwk` guards against >1 delegate item carrying cnf (the ambiguity attack); the "chosen cnf's digest MUST be in the issuer-signed `_sd`" refinement is pending a crafted vector.
- **`src/mandate-jwt.ts` still named `signMandate`/`verifyMandate`** — must rename to `signReceipt`/`verifyReceipt` in P6 (it's the receipt format, NOT the mandate format). The new dSD-JWT verifier (`src/ap2/*`) is the mandate path.
- **`src/index.ts` does NOT yet export the new AP2 verifier** — only the legacy receipt-JWS + policy + client surface. P6 wires `src/ap2/*` in.
- **Legacy camelCase `IntentMandate`/`CartMandate`** (`src/types.ts`) are the OLD non-AP2 model — quarantine as `legacy` in P6.
- **Generator non-determinism (chain vectors only):** ECDSA uses a random nonce (cryptography lib has no RFC-6979) + random SD-JWT salts, so re-running `gen_ap2_vectors.py` changes ALL chain vectors. Keys + iat ARE stable (deterministic). Committed JSON is the source of truth — don't re-run casually. Constraint vectors (`gen_ap2_constraint_vectors.py`) ARE fully deterministic (no crypto).

## Process state
- No background processes/daemons. No long-running jobs.
- Vector-regen tool: Python venv `/tmp/ap2venv` with AP2 SDK at commit `e1ea56d` (`import ap2.sdk` works). Ephemeral (/tmp) — recreate: `python3.13 -m venv /tmp/ap2venv && /tmp/ap2venv/bin/pip install "git+https://github.com/google-agentic-commerce/AP2.git@e1ea56db72a6385bce3e5c1112b3a56ce60acb43"`.
- Last gate verdict: PASS — tsc clean, 123/123 tests, 0 vulns.
- Nothing pushed; nothing published. npm still at 0.2.0.

## Files modified this session
- `src/ap2/` (new this session): `sd-jwt.ts` (P2), `kb-sd-jwt.ts` + `chain.ts` (P3), `keys.ts` (P4), `types.ts` + `constraints.ts` + `max-flow.ts` + `chains.ts` (P5). Plus P1's `parse.ts`/`hash.ts`/`jwk.ts` (prior session).
- `test/ap2/` (new): `sd-jwt.test.ts`, `chain.test.ts`, `keys.test.ts`, `constraints.test.ts`, `checkout-constraints.test.ts`, `chains.test.ts`.
- `test/fixtures/`: `gen_ap2_vectors.py` (rewritten — deterministic keys/time, 3-hop, negatives, x5c), `gen_ap2_constraint_vectors.py` (new), 5 `ap2-*.json` vector files.
- docs: `AP2-AUDIT.md` (new this session — the conformance matrix), `PLAN-AP2.md` (§3 deviation note).
- NOT touched (intentionally): `src/{policy,client}.ts` (solid, non-AP2); `src/{index,mandate-jwt,types,schema,verify}.ts` (P6 will touch index/mandate-jwt/types).

## Anti-patterns (the next agent must NOT do)
- **Don't guess AP2** — every byte checked against committed golden vectors / AP2's source. The whole build's discipline.
- **Don't publish without the gate AND a fresh adversarial review GOOD TO GO AND operator approval.** v0.4/pre-0.5 do NOT verify real AP2 mandates.
- **Don't let `@sd-jwt/*` verify signatures or resolve keys** — jose, ES256-pinned, key out-of-band.
- **Don't re-run `gen_ap2_vectors.py` and commit only one of the JSON files** — they must come from the same run (chain vectors are non-deterministic; constraint vectors are deterministic).
- **Don't break byte-exact violation parity** — constraint messages match AP2's f-strings exactly (except the 2 Python-repr cases). A diverging message is a regression.
- **Don't `git push` / `npm publish` without operator approval.** Don't claim "shipped" without the gate.
- **Don't overclaim in our own docs** (no-overclaim applies to AP2-AUDIT/PLAN too — e.g. "deterministic vectors" was corrected to "stable identities, ECDSA still random").

## Studies / parked items
- `PLAN-AP2.md` §11 hardest items — all built; review must re-focus here (P6 review task).
- Cross-repo: `agent-verifier-pro` is DEPLOYED + hardened (verifier.goodmeta.co). It shares AP2's sign≠enforce + NaN-date traits on its own EIP-712 path — decide separately whether to migrate it to the v0.5 dSD-JWT verifier.
- Vault: `Projects/PROGRESS.md` "Assets built" tracks both repos.

## Discipline failure post-mortem (most recent)
No shipped incident. One self-caught overclaim: the prior handoff's "seed keys → reproducible vectors" fix was based on a wrong premise — ECDSA uses a random nonce (cryptography lib has no RFC-6979) and SD-JWT salts are random, so chain vectors can't be byte-reproducible regardless of key seeding. Caught when the determinism check failed; the generator docstring now states the truth (stable identities, signatures still vary) instead of claiming determinism it can't deliver. No code regression — the committed JSON is the source of truth either way.

## Next concrete action
Start P6 migration: rename `src/mandate-jwt.ts` `signMandate`/`verifyMandate` → `signReceipt`/`verifyReceipt`, then wire the `src/ap2/*` dSD-JWT verifier into `src/index.ts`. Gate after each step: `npm run build && npm test && npm audit`.
