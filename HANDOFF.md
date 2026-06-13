# HANDOFF — 2026-06-13 (UTC)

## TL;DR
- **Stage:** Good Meta agent-payment ecosystem. The OSS lib `@goodmeta/agent-verifier@0.5.0` is DONE + published (prior session, **untouched this session**). This session = make every *other* public GM artifact reflect real AP2 + spec engagement + a new opportunity-CRM.
- **Last shipped:** aeoess #98 comment + PR #110 (crosswalk `release` cell → first-class); `@goodmeta/agent-verifier-mcp@0.2.0` live on npm; both example repos migrated/fixed + pushed; `gm-crm` v1 built (local).
- **Next:** operator-gated one-liners (`npm deprecate "<0.5"`, set `AP2_TRUSTED_KEYS`), OR the AP2 #259 `iss`-MUST PR, OR re-triage the 24 recovered CRM monitors.

## Where we are
This repo (`agent-verifier`, the OSS lib) was **not modified this session** — still `c8ec181`, v0.5.0 on npm, gate green from last session (125 tests). All work was in the *ecosystem around it*:

| Artifact | State after this session |
|---|---|
| `@goodmeta/agent-verifier` (OSS lib) | v0.5.0, unchanged, published. Real AP2 dSD-JWT verifier. |
| `agent-verifier-pro` (hosted, verifier.goodmeta.co) | Done prior session; deployed, verify dark until trust keys. Untouched this session. |
| `ap2-x402-example` (public OSS) | ✅ Migrated to real AP2 via the lib. Pushed `11e0a46`. |
| `a2a-x402-payment-agent` (public OSS) | ✅ Kept ERC-2612 (correct per GM facilitator), default → x402.goodmeta.co. Pushed `8d44b5d`. |
| `@goodmeta/agent-verifier-mcp` | ✅ v0.2.0 published (7 tools). Pushed `5842f49`. |
| `gm-crm` (NEW local tool) | ✅ v1 built. 41 signals (16 today + 25 recovered). Local git, **unpushed**. |
| aeoess/agent-governance-vocabulary #98 | ✅ Comment + PR #110 posted (release-cell). Awaiting maintainer merge. |

**Every public GM artifact now reflects real AP2 / v0.5.** The one ecosystem theme of the session.

## Mandatory rules (do not skip)
- **spec-engagement discipline** (the big one this session): verify-claims gate (opener + most-recent commenter) BEFORE engaging; tier A/B/C; impact gate (who reads / what they DO / what intel / concrete positioning); **show-don't-ship** (Claude drafts, Eric posts — never auto-post to protocol repos unless Eric says "post now"); 5-perspective council on consequential replies; 12h cooling-off (waive-able) via `VAULT/Projects/Good-Meta/Spec-Outbox.md`.
- **no-overclaim** — TWO incidents this session (see post-mortem). Retract immediately when challenged; don't manufacture substance.
- **verify-claims** — check primary sources; don't assume. (Caught: a2a was NOT broken; AP2 still at pinned commit; SpendGuard pkg real; AsterPay ecosystem claim FALSE.)
- **Never claim "shipped" without the gate.** Per-repo gates: lib = `npm run build && npm test && npm audit`; ap2-x402-example = `npm run typecheck && npm test`; mcp = `npm run typecheck && npm run build` + tools handshake; pro = its test loop.
- **Never `npm publish` / `git push` / deploy / post-to-public-thread without explicit operator approval.** This session all pushes + the #98 post + the MCP publish were operator-approved.
- No `Co-Authored-By`; short commit messages. Exact-pin new deps (no `^`/`~`).
- Global: sanity-check-before-recommending; context-first (lead with plain-English catch-up).

## Active task list (snapshot — IDs don't survive sessions)
- [pending] AP2 Conformance Suite DD (FLAGSHIP, web-research, Fable-session)
- [pending] Verifier ICP discovery (Fable, web)
- [pending] [operator] `npm deprecate "@goodmeta/agent-verifier@<0.5"` (OTP)
- [pending] [operator] Enable pro verification — set `AP2_TRUSTED_KEYS` (needs real issuer key)
- [pending] [later] Build `@goodmeta/ap2-issuer` (separate package; minting ≠ verifier)
- [pending] [maybe-PR] AP2 #259 — enforce `iss` MUST in SD-JWT (the one on-canon "do-something"; as a PR not a reply)
- [pending] [intel] Log AsterPay + BlindOracle competitors in ICP tracker
- [pending] [content] claude-code #66438 anecdote (honest framing — NOT a mandate case)
- [pending] [gm-crm] Re-triage 24 recovered historical monitors + wire future scans into CRM

## Task rehydration — run these TaskCreate calls first in a new session
```json
{"subject":"AP2 Conformance Suite DD (FLAGSHIP)","activeForm":"Scoping the AP2 conformance suite play","description":"Highest-leverage long-term GM reputation play (VAULT/Projects/Good-Meta/AP2-Conformance-Suite.md). DD (web, Fable): is anyone in FIDO's Agentic Auth/Payments WGs scoping AP2 conformance? Google/FIDO conformance plan? FIDO contributor process? third-party AP2 conformance repos? First artifact: carve the OSS verifier's vectors + AP2-AUDIT.md + gen_ap2_vectors.py into a standalone implementation-agnostic ap2-conformance harness, contribute into FIDO TWG as reference vectors (NOT a self-declared cert)."}
```
```json
{"subject":"Verifier ICP discovery (Fable 5)","activeForm":"Running verifier ICP discovery","description":"Verifier has NO confirmed ICP. Run VAULT/Projects/Good-Meta/Verifier-Prospecting-Prompt.md (Fable, web) -> 2-3 named ICP archetypes + evidence + kill list. Validate each via Verifier-ICP-Validation-Script.md (Mom-Test, >=3/5). Frame: discovery not conversion."}
```
```json
{"subject":"[operator] npm deprecate @goodmeta/agent-verifier <0.5","activeForm":"Deprecating <0.5","description":"OTP-gated. Operator runs: npm deprecate \"@goodmeta/agent-verifier@<0.5\" \"Versions < 0.5 did NOT verify real AP2 mandates (0.2.x EIP-712; 0.4.0 receipt-JWS). Upgrade to 0.5.0.\"  then verify npm view @goodmeta/agent-verifier@0.2.0 deprecated."}
```
```json
{"subject":"[operator] Enable pro verification (set AP2_TRUSTED_KEYS)","activeForm":"Enabling pro verification","description":"Pro /v1/verify is fail-closed DARK until trust anchors set. When a real issuer P-256 key exists, set AP2_TRUSTED_KEYS (or AP2_TRUSTED_ROOTS) as a Fly secret on app ap2-verifier (under eric@goodmeta.co). See agent-verifier-pro/ISSUER-ONBOARDING.md. NOTE budget API (/v1/budgets,check,settle,release,refund) is already live w/o trust keys — only AP2 mandate verify is dark."}
```
```json
{"subject":"[later] Build @goodmeta/ap2-issuer (separate package)","activeForm":"Tracking the deferred ap2-issuer package","description":"Minting AP2 dSD-JWT mandates does NOT belong in agent-verifier (keep verifier verify-only: trust-role separation, neutral-validator positioning for conformance, avoid circular demos). Today minting = drive AP2's Python SDK (gen_ap2_vectors.py). When a concrete consumer needs runtime TS minting (real-issuer dogfood / customer SDK), build a SEPARATE @goodmeta/ap2-issuer. For now vector-gen lives in the conformance-suite repo."}
```
```json
{"subject":"[maybe-PR] AP2 #259 — enforce iss MUST in SD-JWT mandates","activeForm":"Scoping the AP2 #259 iss-enforcement PR","description":"Single most on-canon opportunity from the 16-signal scan (it's exactly what agent-verifier does). Thread has no maintainer + a chopmob-cloud Tier-C spam comment offering to PR it. Higher-leverage = OPEN THE PR YOURSELF (verifier code backs an iss MUST), route around the thread. show-don't-ship: verify current AP2 SD-JWT iss handling first, draft PR + council, Eric approves before opening. Do NOT just reply. In gm-crm verdict=engage, next_review 2026-06-16."}
```
```json
{"subject":"[intel] Log AsterPay + BlindOracle as competitors/prospects","activeForm":"Logging competitor intel","description":"AsterPay (petteri74dev, asterpay.io) Tier B — REAL budget-reservation facilitator (npm @asterpay/mcp-server@2.1.0, x402.asterpay.io/v1/budget/info live, KYA trust scoring) — closest competitor to GM wedge; overclaims x402.org standing (NOT in ecosystem, verify-claims FAIL). BlindOracle (craigmbrown, AP2 #280) Tier C agent-trust self-promo. Log both in VAULT Good-Meta ICP/competitor tracker; verify AsterPay ecosystem claim before contact; do NOT engage their GitHub threads. Both are rows in gm-crm."}
```
```json
{"subject":"[content] claude-code #66438 anecdote","activeForm":"Filing the #66438 content anecdote","description":"anthropics/claude-code #66438: Opus 4.7 retried a paid Expo EAS build (~$3-5 quota) after being told to ask. HONEST framing: SaaS-quota / conversational-auth-drift, NOT an AP2 payment-mandate failure. Soft anecdote ONLY for 'verbal spend rules don't hold under agent flow-state -> need a structural spend-auth layer'. Newsletter/expert-call context; NO public comment (self-filed, dup-flagged). gm-crm verdict=content, next_review 2026-06-19."}
```
```json
{"subject":"[gm-crm] Re-triage 24 recovered monitors + wire scans into CRM","activeForm":"Re-triaging the recovered monitor backlog","description":"gm-crm (~/code/goodmeta/gm-crm, local git 2 commits, UNPUSHED). SQLite opportunity CRM: dedup-by-url, persistent verdict/state, next_review. 41 signals (16 from 2026-06-12 scan + 25 historical monitors recovered from past ~/vvv Claude transcripts 2026-05-13..06-04). FOLLOW-UPS: (1) re-triage the 24 monitors in `python3 crm.py due` — many 3-4wk old, likely some closed/stale/false-positive (hyperswitch #12282 = card-mandate false-positive like #12687); verify-claims live ones, set verdict+next_review or done/skip. (2) WORKFLOW: every future scan -> seed/<date>-scan.json -> `python3 crm.py ingest` (re-ingest safe, COALESCE preserves decisions). (3) maybe generate a vault markdown digest. (4) decide on a GitHub remote/push. Usage: gm-crm/README.md."}
```

## What changed this session (chronological, latest first)
- `gm-crm` `76411a6` — recovered 25 historical monitor signals from past `~/vvv` Claude session transcripts (8 scans, 2026-05-13..06-04). WHY: weekly scans leaked "monitor" items; this is the durable fix.
- `gm-crm` `77541d1` — gm-crm v1: SQLite opportunity CRM + retro-load of the 2026-06-12 scan (16 signals). WHY: "monitor" verdicts had no backing store → signals evaporated between scans.
- aeoess #98 comment + **PR #110** (on Ectsang fork → upstream) — crosswalk `release` cell `goodmeta '-' → release` (first-class in v0.5). WHY: makes good on Eric's 06-04 statement; v0.5 ships /v1/release distinct from /v1/refund.
- `agent-verifier-mcp` `5842f49` — v0.2.0: added release/refund/query_reservation (mirror pro's hosted /mcp, 7 tools), pinned zod, fixed stale header. **Published to npm.** WHY: the npm pkg lagged pro's MCP by 3 tools.
- `a2a-x402-payment-agent` `8d44b5d` — default facilitator SBC → x402.goodmeta.co. WHY: it's the GM repo; ERC-2612 was already correct (verified via /supported = erc2612).
- `ap2-x402-example` `11e0a46` — full migration EIP-712-fake → real AP2 dSD-JWT via @goodmeta/agent-verifier@0.5.0; minted real scenario mandates; dropped viem; npm test + honest README. WHY: it was teaching a fake AP2 model.

## Open known issues
- **gm-crm is unpushed** (local git only). No GitHub remote yet. `signals.db` is gitignored (only script + seed JSON versioned).
- **24 recovered monitors are un-triaged** — loaded as `monitor`/next_review 2026-06-12, surfacing in `crm.py due`. Many 3-4wk old, likely some closed/stale/false-positive. Need a re-triage pass (task #14).
- **MCP README signup is stale** — references `POST /setup/merchants` which is DEMO_MODE-only (404 on prod, and it WIPES the DB). Public self-signup doesn't exist on prod. (Did not fix this session — flag.)
- **AsterPay ecosystem claim unverified-as-FALSE** — they claim x402.org/ecosystem approval (Feb-11-2026) but are NOT listed. Verify before any contact.
- **AP2 unchanged** — pin `e1ea56d` is still the tip of AP2 main (verified). "byte-exact" still holds.
- Deferred verifier items from prior session (disclosure-reorder vector, H3 tier-2/3 cnf, H2 keyUsage/pathLen) — all issuer-malicious-only, not wire-exploitable. Untouched.

## Process state
- No background processes/daemons running (local pro on :4010 + demo merchant on :3000 were started for verification and killed; ports clear).
- npm: `@goodmeta/agent-verifier@0.5.0` latest; `@goodmeta/agent-verifier-mcp@0.2.0` latest (published this session, verified live).
- Last gates: ap2-x402-example 24/24 tests + 4 demos + HTTP flow ✓ 0 vulns; mcp tsc+build+7-tool handshake ✓; a2a tsc ✓ (payment path not e2e-tested — needs funded wallet, deemed unnecessary as code unchanged); pro budget API verified live via local run (all 7 MCP tools end-to-end).
- gm-crm: 41 signals (monitor 28, skip 9, content 1, done 1, engage 1, after #98→done). `crm.py due` shows 24 (the recovered backlog).

## Files modified this session
- `agent-verifier` (this repo): only `HANDOFF.md` (this file). Lib code untouched.
- `ap2-x402-example/`: full rewrite — new `verify-mandate.ts`, `verify-flow.ts`, `verify.test.ts`, `fixtures/{gen_example_vectors.py,ap2-scenarios.json,scenarios.ts}`; rewrote middleware/{index,types,agent-card,payment-router}.ts, demo-merchant/{server,agent-demo}.ts, demos/{ramp,square,coupa}.ts; deleted ap2-signer/ap2-types/cart+intent-flow/mandate-verifier; README; package.json (drop viem, +agent-verifier).
- `a2a-x402-payment-agent/`: `src/server/index.ts` + `.env.example` (facilitator default only).
- `agent-verifier-mcp/`: `src/index.ts` (7 tools), `package.json` (+zod, 0.2.0), `README.md`, `dist/`.
- `gm-crm/` (NEW): `crm.py`, `README.md`, `.gitignore`, `seed/2026-06-12-opportunity-scan.json`, `seed/historical-monitors.json`.
- Vault (iCloud, not git): `Projects/Good-Meta/Spec-Outbox.md` (#98 → SHIPPED).

## Anti-patterns (the next agent must NOT do)
- **Don't take the opportunity-scanner's suggested "Actions" at face value** — they over-recommend "comment / co-author / reference agent-verifier" on threads that fail the impact gate (no maintainer present) or elevate Tier-C parties. Triage with verify-claims + tier first.
- **Don't overclaim** — this session had 2 (a2a "broken"; the grace-window claim). Verify primary sources; retract on challenge.
- **Don't engage spec threads with no maintainer + Tier-C contamination** (most of the 16 scan signals).
- **Don't assume the OSS lib changed** — it didn't this session; it's v0.5.0 published.
- **Don't auto-post to public protocol threads / push / publish without operator approval.** Don't claim "shipped" without the per-repo gate.
- **Don't re-ingest a scan expecting it to overwrite decisions** — gm-crm ingest COALESCEs (preserves verdict/next_review); use `crm.py decide` to change a decision.

## Studies / parked items
- AP2 Conformance Suite (flagship) — `VAULT/Projects/Good-Meta/AP2-Conformance-Suite.md`.
- Verifier ICP discovery instruments — `VAULT/Projects/Good-Meta/Verifier-Prospecting-Prompt.md` + `Verifier-ICP-Validation-Script.md`.
- gm-crm v2 ideas — vault markdown digest of the DB; GitHub remote; auto-ingest hook from the scanner.

## Discipline failure post-mortem (most recent)
**Two no-overclaim slips this session, both caught before shipping public (the gates worked).**
1. **a2a "broken" overclaim.** I asserted the a2a x402 client was broken / would be rejected, and started an EIP-3009 rewrite — assuming a standard Coinbase-style facilitator. Eric corrected; checking `x402.goodmeta.co/supported` (primary source) showed `assetTransferMethod: erc2612` — the original ERC-2612 was *correct* for GM's facilitator. Reverted; net change was just the facilitator default. Fix: verify the facilitator's advertised method before claiming a payment path is wrong.
2. **Grace-window overclaim.** A draft #98 comment claimed "goodmeta hold TTL 5min lands on SpendGuard's relaxed grace bound." Eric challenged; `HOLD_WINDOW_MS` is the hold *lifetime* (held→expired), NOT a grace window — goodmeta has no grace concept. Conflated two things to add substance. Cut entirely; show-don't-ship caught it pre-post.
Both reinforce: verify-claims on primary sources + don't manufacture substance; show-don't-ship + cooling-off are why neither reached the public.

## Next concrete action
Pick one: (a) operator runs the two one-liners (npm deprecate <0.5; set AP2_TRUSTED_KEYS); (b) next agent scopes the AP2 #259 `iss`-MUST PR (verify AP2 SDK iss handling → draft → council → Eric approves → open); or (c) re-triage the 24 recovered monitors via `cd ~/code/goodmeta/gm-crm && python3 crm.py due`.
