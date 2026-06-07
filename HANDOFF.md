# HANDOFF — 2026-06-07 (UTC)

## TL;DR
- **Stage:** building a REAL AP2 mandate verifier (dSD-JWT delegation chains) as v0.5, phased + golden-vector-driven. P0–P1 done.
- **Last shipped:** `f59cf14` P1 — `parse`/`hash`/`jwk`, **byte-exact vs AP2's own SDK output**, tsc clean, 40 tests, 0 vulns.
- **Next:** P2 — `src/ap2/sd-jwt.ts`: root SD-JWT verify (jose, ES256-pinned) + disclosure resolution (incl. AP2's `delegate_payload` wrapping + CMWallet inline-digest quirk); add `@sd-jwt/decode`.

## Where we are
We discovered (this session) the OSS lib mis-modeled AP2 TWICE: EIP-712, then plain whole-payload JWS. Real AP2 mandates are **dSD-JWT delegation chains** (SD-JWT root + KB-SD-JWT hops, `cnf.jwk` hop-chaining, `sd_hash`/`issuer_jwt_hash` binding, ES256/P-256). Plain JWS is AP2's *receipt* format only. Plan in `PLAN-AP2.md` (3-angle red-teamed, hardened). Build phases:

| Phase | Status | Pass criterion |
|---|---|---|
| P0 generator + payment vectors | ✅ `9871f91`/`70cebd8` | real AP2 chains minted → committed JSON |
| P1 parse / hash / jwk | ✅ `f59cf14` | byte-exact vs AP2 (string AND digest); tsc clean |
| P2 sd-jwt root verify + disclosure resolution | ⏳ NEXT | resolves root open-mandate payload == AP2's |
| P3 kb-sd-jwt + chain (+3-hop/tamper/reorder vectors) | ⏳ | valid chains verify, all tampered reject |
| P4 x5c fail-closed (+hand-built cert vectors) | ⏳ | trusted-root mandatory; full cert checks |
| P5 types + constraints (max-flow) + payment/checkout wrappers | ⏳ | self-computed linkage; constraints match AP2 |
| P6 fresh review → docs → publish v0.5 + deprecate <0.5 | ⏳ | review GOOD TO GO; operator publishes |

Gate now: `npm run build` tsc clean, `npm test` 40/40, `npm audit` 0 vulns.

## Mandatory rules (do not skip)
- **Match AP2's WIRE FORMAT byte-exact; be STRICTER than AP2 on trust decisions** (PLAN-AP2.md §1). AP2's reference fails open in places (x5c, aud/nonce, caller-supplied linkage) — we fail closed (PLAN §5 hardenings H1–H7).
- **Golden vectors from AP2's own SDK are the source of truth** — verify every phase against `test/fixtures/ap2-*.json`, never against our own reading. (This is the anti-guessing backbone; two prior AP2 mistakes came from guessing.)
- **Pin ES256 in OUR jose callback on every signature** — `@sd-jwt/*` pins no alg and never resolves header keys; key supplied out-of-band, header `jwk`/`jku`/`x5u`/`kid` never auto-resolved.
- **Never claim "shipped"/"ready" without the gate:** `npm run build && npm test && npm audit`.
- **Never `git push` or `npm publish` without explicit operator approval.** Nothing is pushed; npm is still at 0.2.0.
- **Exact dependency pins** (no `^`/`~`): jose 6.2.3, zod 4.4.3, @types/node 20.19.42, tsx 4.21.0, typescript 5.9.3. When adding `@sd-jwt/*`, pin exact AND pin transitive `js-base64`.
- **No `Co-Authored-By` in commits; short commit messages** (operator preference).
- Global: sanity-check-before-recommending; no-overclaim; verify-claims; show-don't-ship for any public protocol-repo post (#98).

## Active task list (snapshot — IDs don't survive sessions)
- **[in_progress]** agent-verifier v0.5: real AP2 dSD-JWT verifier — P0/P1 done, P2 next.
- [pending] Discharge aeoess #98 (crosswalk `release`-cell PR + comment) — show-don't-ship; BLOCKED on v0.5 publish (was tied to release/refund, which now ships in v0.5).
- [pending] verifier-pro: review/clean untracked `ADVERSARIAL-REVIEW-LOG.md`; its `HANDOFF.md` calls CRIT-1 open (resolved). Cross-repo.

## Task rehydration — run these first in a new session
```json
{
  "subject": "agent-verifier v0.5: real AP2 dSD-JWT verifier (P2 next)",
  "activeForm": "Building AP2 dSD-JWT verifier (P2)",
  "description": "Plan: PLAN-AP2.md (hardened, 3-angle red-teamed). Done: P0 generator+vectors (test/fixtures/gen_ap2_vectors.py + ap2-vectors.json + ap2-hash-pairs.json, minted from AP2's real SDK), P1 src/ap2/{parse,hash,jwk}.ts byte-exact vs AP2 (test/ap2/{parse-hash,jwk}.test.ts). NEXT P2: src/ap2/sd-jwt.ts — verify the root issuer JWT signature with jose compactVerify({algorithms:['ES256']}) using the provider key (NOT @sd-jwt's verifier; @sd-jwt pins no alg + must never resolve header keys), then resolve disclosures: standard RFC9901 _sd via @sd-jwt/decode, PLUS AP2's delegate_payload-as-array-with-own-_sd and the CMWallet 'digest strings directly in delegate_payload' quirk (port from AP2 chain.py::_inline_sd_claims + kb_sd_jwt.py::_resolve_delegate_payload). Add @sd-jwt/decode (exact-pin; pin transitive js-base64). Golden-test: root verify of valid_payment_2hop must yield expectedPayloads[0] (the OpenPaymentMandate). Then P3 kb+chain, P4 x5c, P5 types/constraints/wrappers, P6 review+publish. Regen vectors: /tmp/ap2venv/bin/python test/fixtures/gen_ap2_vectors.py (venv has AP2 SDK). Gate each phase: npm run build && npm test && npm audit. SUCCESS: each phase byte-exact-green vs vectors; final fresh adversarial review GOOD TO GO before publish."
}
```
```json
{
  "subject": "Discharge aeoess #98 after v0.5 publish",
  "activeForm": "Drafting #98 crosswalk PR + comment",
  "description": "AFTER agent-verifier v0.5 is published with real AP2 release/refund support, discharge Eric's 2026-06-04 commitment on aeoess/agent-governance-vocabulary#98 (comment 4619176813): (1) crosswalk budget_reservation.yaml goodmeta `release` cell PR; (2) #98 follow-up. show-don't-ship: 5-perspective council, stage gh, operator posts. verify-claims first."
}
```

## What changed this session (chronological, latest first)
- `70cebd8` sync ap2-vectors.json with hash-pairs (same generator run). WHY: generator is non-deterministic; keep the two fixtures consistent.
- `f59cf14` **P1** parse/hash/jwk byte-exact vs AP2 + @types/node. WHY: canonical serialization + binding-hash math are the dangerous core; proven against reference.
- `9871f91` **P0** AP2 golden-vector generator + payment vectors. WHY: anti-guessing backbone — test against AP2's real bytes.
- `7692f6f` hardened AP2 dSD-JWT plan (3-angle red-teamed). WHY: plan attacked before coding; caught the `_canonical_chain_segment` split (would've broken every binding hash), x5c-fails-open, cnf-smuggling.
- `d2d0d66`/`e741039` doc fixes (EIP-712→ES256 JWS) in SECURITY.md/schema.ts.
- `3228e3d` switch mandates EIP-712→ES256 JWS (v0.4). WHY: later found this matches AP2 *receipts* not *mandates* — held, superseded by v0.5.
- `73a3c21` reject NaN dates in checkConstraints (expiry-bypass fix, from adversarial review).
- `de98693` pin deps, clear ws advisory, CI/SECURITY/CHANGELOG, v0.3.0.
- `ea8f05e` add release()/refund()/createBudget() to client.
- `7ed73bc` harden VerifierClient (timeouts, typed errors, no blind error parse).
- (`c4160f3` validate money inputs with zod; fix budget-inflation bug — earliest session commit.)

## Open known issues
- **Generator non-determinism:** `gen_ap2_vectors.py` generates fresh random EC keys per run, so re-running CHANGES the committed vectors and dirties git. Committed JSON is the source of truth — do NOT re-run casually. FIX (do in P2/P3): seed key generation (derive EC keys from fixed bytes) so vectors are reproducible.
- **v0.4 (ES256-JWS-over-whole-mandate) is committed but MUST NOT be published** — it matches AP2's receipt format, not its mandate format. v0.5 (real dSD-JWT) supersedes. npm is still 0.2.0 (the old EIP-712 version, publicly published 2026-03-24, immutable).
- **`mandate-jwt.ts` still named `signMandate`/`verifyMandate`** — rename to `signReceipt`/`verifyReceipt` in P6 (it's the receipt format). Legacy camelCase `IntentMandate`/`CartMandate` to be quarantined.
- Deferred vectors: 3-hop / checkout / x5c / alg-swap / expired / disclosure-reorder land with P3/P4/P5 (PLAN §7).
- No project `CLAUDE.md` in this repo (rules live in PLAN-AP2.md + global `~/.claude/rules`).

## Process state
- No background processes/daemons. The 5 subagents used this session (reviews + AP2 study + 3-angle plan red team) all COMPLETED.
- Vector-regen tool: Python venv at `/tmp/ap2venv` with AP2 SDK installed (`import ap2.sdk` works). Ephemeral (/tmp) — recreate with `python3.13 -m venv /tmp/ap2venv && /tmp/ap2venv/bin/pip install "git+https://github.com/google-agentic-commerce/AP2.git"`.
- Last gate verdict: PASS — tsc clean, 40/40 tests, 0 vulns.
- Nothing pushed; nothing published.

## Files modified this session
- `src/`: `schema.ts`, `verify.ts`, `policy.ts`, `client.ts`, `types.ts`, `index.ts`, `mandate-jwt.ts` (new); `src/ap2/{parse,hash,jwk}.ts` (new, P1).
- `test/`: `schema/policy/verify/client/mandate-jwt.test.ts`; `test/ap2/{parse-hash,jwk}.test.ts` (new); `test/fixtures/gen_ap2_vectors.py` + `ap2-vectors.json` + `ap2-hash-pairs.json` (new).
- docs/config: `PLAN-AP2.md` (new), `CHANGELOG.md`, `SECURITY.md`, `README.md`, `.github/workflows/ci.yml`, `package.json`, `package-lock.json`.

## Anti-patterns (the next agent must NOT do)
- **Don't publish v0.4** — it does not verify real AP2 mandates (receipt format). Only publish after v0.5's real dSD-JWT verifier + a fresh adversarial review returns GOOD TO GO.
- **Don't guess AP2** — every byte must be checked against the committed golden vectors / AP2's source. Two prior mistakes came from reading a plausible-looking file (jwt_helper = receipts) instead of the mandate path.
- **Don't let `@sd-jwt/*` verify signatures or resolve keys** — jose, ES256-pinned, key out-of-band.
- **Don't re-run the generator and commit only one of the two JSON files** — they must come from the same run (or seed the keys first).
- **Don't `git push` / `npm publish` without operator approval.** Don't claim "shipped" without the gate.
- **Don't post the #98 crosswalk PR/comment yourself** — show-don't-ship.

## Studies / parked items
- `PLAN-AP2.md` §11 hardest items: `_canonical_chain_segment`+parse byte-exactness (done in P1), disclosure resolution + CMWallet quirk (P2), cnf-bound-to-signed-content + single-cnf (P3), x5c fail-closed (P4), LineItems max-flow port (P5).
- Cross-repo: `agent-verifier-pro` is DEPLOYED + hardened (verifier.goodmeta.co; rounds 1-7 fixes live as of 2026-06-06). It shares AP2's sign≠enforce + NaN-date traits on its own EIP-712 path — decide separately whether to migrate it to the v0.5 dSD-JWT verifier.
- Vault: `Projects/PROGRESS.md` "Assets built" tracks both repos.

## Discipline failure post-mortem (most recent)
No shipped incident — the opposite, and it's the session's main story. The lib had mis-implemented AP2 (EIP-712) and that was already public on npm 0.2.0. This session almost shipped a SECOND wrong model (plain ES256-JWS "to match AP2") — caught by reading AP2's actual SDK (jwt_helper = receipts; mandates = SD-JWT chains) and a 3-angle red team that attacked the plan BEFORE any code. The structural fix preventing recurrence: golden vectors minted from AP2's own SDK (`test/fixtures/`), tested byte-exact, so a wrong model can no longer pass. Operator's "read the spec properly → plan → attack → execute" cadence is now the rule for this build.

## Next concrete action
Start P2: create `src/ap2/sd-jwt.ts` (root issuer-JWT verify via jose `compactVerify({algorithms:['ES256']})` + disclosure resolution incl. CMWallet quirk), `npm i -D --save-exact @sd-jwt/decode@<latest>` (pin transitive js-base64), and a `test/ap2/sd-jwt.test.ts` asserting the root verify of `valid_payment_2hop` yields `expectedPayloads[0]`.
