# HANDOFF — 2026-06-09 (UTC)

## TL;DR
- **Stage:** agent-verifier v0.5 (real AP2 dSD-JWT mandate verifier) is **BUILT, REVIEWED, and PUBLISHED to npm.** P0–P6 complete.
- **Last shipped:** `@goodmeta/agent-verifier@0.5.0` published 2026-06-09 04:45 UTC (npm `latest`). Verified live (`npm view` → 0.5.0). Repo at `311be28`, gate green (build clean, 125 tests, 0 vulns).
- **Next:** **agent-verifier-pro PARITY** — the paid hosted service (verifier.goodmeta.co) still runs the OLD EIP-712 model; migrate it to the v0.5 `ap2.*` dSD-JWT verifier so the product matches the now-correct OSS lib. (Plus two loose ends: run `npm deprecate "<0.5"` — OTP-gated; discharge aeoess #98 — now unblocked.)

## Where we are
The OSS library is DONE and SHIPPED. The full dSD-JWT verifier was built phase-by-phase, byte-exact vs AP2's reference SDK (pinned commit `e1ea56d`), passed a 6-reviewer adversarial review (1 HIGH fail-open found + fixed), and is published.

| Phase | Status | Evidence |
|---|---|---|
| P0 generator + payment vectors | ✅ | `test/fixtures/ap2-*.json` minted from AP2's real SDK |
| P1 parse / hash / jwk | ✅ | byte-exact vs AP2 (`f59cf14`) |
| P2 root verify + disclosure resolution | ✅ | `c6b79d6` |
| P3 kb-sd-jwt + chain (+8 hand-built negatives) | ✅ | `ece17aa`, `ff51904` |
| P4 x5c fail-closed + kid | ✅ | `a205d9b` (6 x5c vectors, 4 AP2-confirmed-accept hardenings) |
| P5 types + 10 constraints (max-flow) + linkage + receipt-ref | ✅ | `b22202c`/`e7f95e9`/`c0b6a9b` (byte-exact violations) |
| P6 migration/docs + review + publish | ✅ | `6003272`/`8b9167f`/`311be28` + npm 0.5.0 live |

**65 golden vectors, 125 tests, all validated against AP2's own SDK output.** Conformance matrix: `AP2-AUDIT.md` (every AP2 requirement → test/vector, pinned to `e1ea56d`; §11a logs the P6 review).

## Mandatory rules (do not skip)
- **Match AP2's WIRE FORMAT byte-exact; be STRICTER than AP2 on trust** (PLAN-AP2.md §5 H1–H7, all live). Every divergence is a documented hardening in AP2-AUDIT.md.
- **Golden vectors from AP2's SDK (commit `e1ea56d`) are the source of truth.** Faithfulness directive (operator, 2026-06-07): "keep golden vectors + line-for-line port of AP2's Python algorithm — 100% faithful." Pinned to `e1ea56d`; if AP2 changes, re-audit.
- **Never claim "shipped" without the gate:** `npm run build && npm test && npm audit`. (`build` now cleans `dist`; `prepublishOnly` re-runs build+test.)
- **Never `npm publish` / `git push` without explicit operator approval.** v0.5 publish WAS approved + done. Future publishes need fresh approval. npm publish/deprecate require 2FA OTP (operator-supplied).
- **No `Co-Authored-By`; short commit messages** (operator preference).
- Global: sanity-check-before-recommending; no-overclaim (applies to our own docs); verify-claims; show-don't-ship for any public protocol-repo post.

## Active task list (snapshot — IDs don't survive sessions)
- **[in_progress]** agent-verifier-pro PARITY — migrate the hosted service to the v0.5 `ap2.*` dSD-JWT verifier (it still uses the old EIP-712 / whole-payload-JWS model the OSS lib just abandoned).
- [pending] `npm deprecate "@goodmeta/agent-verifier@<0.5"` — OTP-gated, one command (text below).
- [pending] Discharge aeoess #98 — crosswalk `release`-cell PR + comment; was BLOCKED on v0.5 publish, now UNBLOCKED. show-don't-ship.
- [pending] agent-verifier-pro: commit its untracked `ADVERSARIAL-REVIEW-LOG.md` (durability).
- [pending] (deferred, documented, non-blocking) disclosure-reorder vector; H3 tier-2/3 cnf guard + signed-`_sd` refinement; H2 keyUsage/pathLen. All issuer-malicious-only (not wire-exploitable) per the P6 review.

## Task rehydration — run these first in a new session
```json
{
  "subject": "agent-verifier-pro parity with v0.5 dSD-JWT verifier",
  "activeForm": "Migrating agent-verifier-pro to the v0.5 verifier",
  "description": "agent-verifier (OSS) v0.5 is PUBLISHED and verifies REAL AP2 mandates (dSD-JWT chains) via the ap2.* namespace. agent-verifier-pro (~/code/goodmeta/agent-verifier-pro, hosted at verifier.goodmeta.co, Fly.io) STILL runs the OLD model: EIP-712 / whole-payload ES256 JWS, which is AP2's RECEIPT format, not its MANDATE format. So the paid product overstates AP2 compat exactly as the OSS lib did before this session. TASK: bring pro to parity. (1) Audit pro's src/engine verification path — confirm it's the old model. (2) Decide integration: depend on @goodmeta/agent-verifier@0.5 and route mandate verification through ap2.verifyChain + ap2.verifyPaymentChain (+ x5c provider), keeping pro's budget/hold/settle/refund state layer (which is solid). (3) Pro shares AP2's sign≠enforce + NaN-date traits on the EIP-712 path — those die with the migration. (4) Re-verify on prod after deploy (hit the URL). NOTE: pro was NOT touched or re-verified this session — confirm its current state firsthand before changing. SUCCESS: pro verifies a real dSD-JWT mandate end-to-end; honest changelog; deployed + verified live. Never deploy untested; run pro's tests first."
}
```
```json
{
  "subject": "Deprecate agent-verifier <0.5 on npm",
  "activeForm": "Deprecating <0.5",
  "description": "v0.5.0 is published (latest). Old 0.2.0 is still undeprecated (the deprecate command is 2FA-OTP-gated and was deferred). Operator runs: npm deprecate \"@goodmeta/agent-verifier@<0.5\" \"Versions < 0.5 did NOT verify real AP2 mandates (0.2.x EIP-712; 0.4.0 receipt-JWS). Upgrade to 0.5.0.\" — then verify: npm view @goodmeta/agent-verifier@0.2.0 deprecated."
}
```
```json
{
  "subject": "Discharge aeoess #98 (now unblocked by v0.5 publish)",
  "activeForm": "Drafting #98 crosswalk PR + comment",
  "description": "v0.5 now ships real AP2 release/refund support, so Eric's 2026-06-04 commitment on aeoess/agent-governance-vocabulary#98 is unblocked. (1) crosswalk budget_reservation.yaml goodmeta 'release' cell PR; (2) #98 follow-up comment. show-don't-ship: 5-perspective council, stage gh, operator posts. verify-claims first."
}
```

## What changed this session (chronological, latest first)
- **PUBLISHED** `@goodmeta/agent-verifier@0.5.0` to npm (2026-06-09 04:45 UTC), operator-approved, OTP completed by operator. Verified live.
- `311be28` P6: `build` now `rm -rf dist && tsc` + `prepublishOnly` gate. WHY: dry-run caught stale `dist/mandate-jwt.*` + `dist/sign.*` that would have shipped the old `signMandate` API.
- `8b9167f` P6 review fixes: closed the **HIGH chain-truncation fail-open** (aud/nonce bypass — a chain truncated to end on an intermediate hop skipped the terminal-only aud/nonce check) + froze CHAIN_CAPS + ASCII hash guard + instrument null-parity + receiptReference docs. WHY: the 6-reviewer adversarial review (publish gate).
- `6003272` P6 migration/docs: `signMandate`→`signReceipt` (it's the receipt format), wired `ap2.*` public namespace, honest README/CHANGELOG (dSD-JWT), v0.5.0. WHY: the public surface was misnaming receipts as mandates.
- `6a05668` AP2-AUDIT P5 complete; `c0b6a9b`/`e7f95e9`/`b22202c` P5a/b/c (types, constraints, max-flow, wrappers, linkage, receipt-ref). WHY: the mandate-semantics + constraint surface, byte-exact vs AP2.

## Open known issues
- **agent-verifier-pro is on the OLD AP2 model** (EIP-712 / receipt-JWS) — the headline parity gap. Not touched this session.
- **`npm deprecate "<0.5"` not yet run** (OTP-gated). 0.2.0 still shows no deprecation warning.
- **Deferred verifier items (documented, non-blocking, NOT wire-exploitable):** disclosure-reorder vector; H3 cnf guard only covers tier-1 delegate items (tiers 2/3 are signed → not attacker-injectable) + signed-`_sd` refinement; `cnfDict` requires `jwk` object where AP2 checks key-presence; H2 basic-keyUsage/pathLen (node `X509Certificate` doesn't expose them, bounded by `CA:TRUE`). All require a malicious/buggy issuer who already controls the keys.
- **Generator non-determinism (chain vectors):** ECDSA random nonce + random salts ⇒ re-running `gen_ap2_vectors.py` churns all chain vectors. Committed JSON is the source of truth. Constraint vectors (`gen_ap2_constraint_vectors.py`) ARE deterministic.

## Process state
- No background processes/daemons. No long-running jobs.
- npm: `@goodmeta/agent-verifier@0.5.0` live, tag `latest`; 0.2.0 still present (undeprecated). Authed as `goodmeta`.
- Vector-regen tool: Python venv `/tmp/ap2venv` with AP2 SDK at `e1ea56d` (ephemeral /tmp). Recreate: `python3.13 -m venv /tmp/ap2venv && /tmp/ap2venv/bin/pip install "git+https://github.com/google-agentic-commerce/AP2.git@e1ea56db72a6385bce3e5c1112b3a56ce60acb43"`.
- Last gate verdict: PASS — build clean, 125/125 tests, 0 vulns. Working tree clean.

## Files modified this session
- `src/`: new `ap2/{sd-jwt,kb-sd-jwt,chain,keys,types,constraints,max-flow,chains,index}.ts`; `receipt-jwt.ts` (renamed from `mandate-jwt.ts`); `index.ts` rewired; comment fixes in `verify.ts`/`schema.ts`.
- `test/`: new `ap2/{sd-jwt,chain,keys,constraints,checkout-constraints,chains}.test.ts`; `receipt-jwt.test.ts` (renamed).
- `test/fixtures/`: `gen_ap2_vectors.py`, `gen_ap2_constraint_vectors.py`, 5 `ap2-*.json` vector files.
- docs/config: `AP2-AUDIT.md` (new, conformance matrix), `README.md`, `CHANGELOG.md`, `package.json` (0.5.0 + build hygiene), `examples/single-merchant.ts`, `PLAN-AP2.md`.

## Anti-patterns (the next agent must NOT do)
- **Don't assume pro is correct** — it's still on the old AP2 model; verify its state firsthand before claiming parity.
- **Don't guess AP2** — every byte checked against committed golden vectors / AP2's source at `e1ea56d`.
- **Don't let `@sd-jwt/*` verify sigs or resolve keys** — jose, ES256-pinned, key out-of-band (native port for disclosure math).
- **Don't `npm publish` / deploy / `git push` without operator approval.** Don't claim "shipped" without the gate. Don't deploy pro untested.
- **Don't re-run `gen_ap2_vectors.py` and commit only one JSON file** (chain vectors non-deterministic).

## Studies / parked items
- `PLAN-AP2.md` §11 hardest items — all built + reviewed.
- Cross-repo: `agent-verifier-pro` parity is the active follow-on (see rehydration). It also has an untracked `ADVERSARIAL-REVIEW-LOG.md` to commit.
- Vault: `Projects/PROGRESS.md` line 90 "Agent Verifier (OSS SDK)" tracks status.

## Discipline failure post-mortem (most recent)
No shipped incident. The publish dry-run CAUGHT two would-be problems before they shipped: (1) npm 2FA blocked an un-approved-looking flow until the operator completed OTP (correct gate); (2) `tsc` had left stale `dist/mandate-jwt.*` + `dist/sign.*` from renamed/deleted sources, which the `--dry-run` surfaced — fixed by making `build` clean `dist` first. Lesson reinforced: always `npm publish --dry-run` and read the file list before a real publish.

## Next concrete action
Start the agent-verifier-pro parity task: `cd ~/code/goodmeta/agent-verifier-pro`, read `src/engine` + `HANDOFF.md`, confirm it's the old EIP-712 model, then plan routing its mandate verification through `@goodmeta/agent-verifier@0.5`'s `ap2.verifyChain` + `ap2.verifyPaymentChain`.
