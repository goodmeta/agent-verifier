# HANDOFF — 2026-06-06 (UTC)

## TL;DR
- **Stage:** OSS `@goodmeta/agent-verifier` hardened for production v0.3.0; pre-publish adversarial review returned **NOT READY**.
- **Last shipped:** `73a3c21` — reject NaN dates in `checkConstraints` (expiry-bypass fix). All work committed locally; **nothing pushed, nothing published.**
- **Next concrete action:** get operator's decision on CRIT-1 (sign-vs-enforce gap), then finish review fixes → `git push` → `npm publish` v0.3.0 → discharge aeoess #98.

## ⚠️ Load-bearing facts (read first)
- **Publish is HELD.** The pre-publish review found 1 CRITICAL + 1 HIGH. HIGH is fixed (`73a3c21`); **CRITICAL needs an operator design decision** (below) and is unresolved. Do NOT `npm publish` or `git push` until CRIT-1 is resolved and a re-review returns GOOD TO GO. Operator pre-approved push+publish *conditional on a clean review* — that condition is not yet met.
- **CRIT-1 (sign ≠ enforce):** `INTENT_MANDATE_TYPES` (`src/verify.ts:19-28`) signs only `id, intent, maxAmount, currency, validUntil, budgetTotal`. `checkConstraints` enforces `validFrom, allowedMerchants, blockedMerchants, categories` — none signed. A malicious agent holding a validly-signed mandate can mutate its allowlist/categories/validFrom without breaking the signature → scope/merchant/category/expiry-window bypass. **The identical type set exists in `agent-verifier-pro/src/engine/verify.ts`** — same gap, deployed. Decision needed: (i) extend the signed EIP-712 payload (+`sign.ts` in lockstep) to cover enforced fields — but verify against AP2's canonical IntentMandate types first (interop), or (ii) if a reduced signature is intentional, change the README + `checkConstraints` docs to stop implying the signature protects scope. Do not change the crypto unilaterally.
- **npm:** `@goodmeta/agent-verifier` published `0.2.0` (2026-03-24). `package.json` is now at `0.3.0` but **NOT published**.

## Where we are
| Step | Status | Pass criterion |
|---|---|---|
| Money-parsing fix (zod) + tests | ✅ `c4160f3` | budget-inflation + parseInt bugs gone; tests lock them |
| Harden VerifierClient | ✅ `7ed73bc` | timeout, typed VerifierError, 403-denial returned |
| release()/refund()/createBudget() | ✅ `ea8f05e` | lifecycle parity w/ hosted verifier |
| Deps pinned, vulns cleared, v0.3.0, CI/docs | ✅ `de98693` | `npm audit` = 0; CI build+test gate added |
| Temporal NaN expiry-bypass fix | ✅ `73a3c21` | unparseable dates rejected; regression test |
| **Pre-publish adversarial review** | ❌ **NOT READY** | a fresh uber-strict reviewer returns GOOD TO GO |
| CRIT-1 resolution | ⏳ **operator decision** | sign-vs-enforce closed or documented |
| MED-3 / LOW-5 fixes | ⏳ pending | fail-open allowlist/category; policy number guards |
| `git push` | ❌ not done | after GOOD TO GO |
| `npm publish` v0.3.0 | ❌ not done | after push; operator-confirmed |
| Discharge aeoess #98 (crosswalk PR + comment) | ❌ pending | show-don't-ship; needs push live first |

Gate now: `npm run build` clean, `npm test` 32/32 pass, `npm audit` 0 vulns.

## Mandatory rules (do not skip)
- **Never `npm publish` / `git push` without operator go** — outward-facing + irreversible. Publish only after a fresh review is GOOD TO GO.
- **Security/money paths get an adversarial review BEFORE they ship** (this session's lesson — the review caught a real expiry bypass + the sign/enforce gap).
- **Never claim "ready"/"shipped" without running the gate:** `npm run build && npm test && npm audit`.
- **Exact dependency pins** — no `^`/`~` (supply chain). Currently: viem 2.52.2, zod 4.4.3, tsx 4.21.0, typescript 5.9.3.
- **No `Co-Authored-By` in commits** (engineering.md).
- **All money inputs go through `Cents`/`parseCents` (`src/schema.ts`)** — never add a money path that bypasses it.
- **#98 discharge is show-don't-ship** — draft the crosswalk PR + comment, run the 5-perspective council, operator posts. 12h cooling-off default.
- sanity-check-before-recommending; no-overclaim; verify-claims (verify the AP2 canonical-types claim before acting on CRIT-1).

## Active task list (snapshot — IDs don't survive sessions)
- **[in_progress]** OSS agent-verifier: resolve CRIT-1 → re-review → push → publish v0.3.0.
- [pending] Discharge aeoess/agent-governance-vocabulary #98 (crosswalk `release`-cell PR + follow-up comment) — show-don't-ship; needs publish live.
- [pending] MED-3/LOW-5 review fixes (fail-open allowlist/category; checkPolicy numeric-field guards) — fold with CRIT-1.
- [pending] Cross-repo: same NaN-date + sign/enforce gap exists in `agent-verifier-pro`; decide whether to patch the deployed service.
- [pending] verifier-pro: review/clean untracked `ADVERSARIAL-REVIEW-LOG.md`; its `HANDOFF.md` is stale ("prod runs pre-fix image" — false; prod is hardened as of `8908f67`-era deploys today).

## Task rehydration — run these TaskCreate calls first thing
```json
{
  "subject": "Resolve CRIT-1 then publish agent-verifier v0.3.0",
  "activeForm": "Resolving CRIT-1 and publishing v0.3.0",
  "description": "Pre-publish review (NOT READY) found the EIP-712 signed payload (INTENT_MANDATE_TYPES, src/verify.ts) does not cover constraint fields that checkConstraints enforces (allowedMerchants/blockedMerchants/categories/validFrom). DECISION (operator): (i) extend the signed types + sign.ts to cover enforced fields — FIRST verify against AP2's canonical IntentMandate EIP-712 types to avoid breaking interop; or (ii) keep reduced signature and update README + checkConstraints docs to not claim the signature protects scope. Then apply MED-3 (fail-open allowlist when merchantId omitted: deny; category with no items: deny) + LOW-5 (Number.isFinite guards on policy budgetTotal/maxPerEvent/currentSpend), add regression tests, re-run gate (build+test+audit), spawn a FRESH uber-strict reviewer until GOOD TO GO. THEN (operator pre-approved) git push origin main + npm publish (v0.3.0). Success: review GOOD TO GO + 0.3.0 on npm. Same gaps exist in agent-verifier-pro — decide separately whether to patch the deployed service."
}
```
```json
{
  "subject": "Discharge aeoess #98 (crosswalk PR + comment)",
  "activeForm": "Drafting #98 crosswalk PR + comment",
  "description": "After agent-verifier v0.3.0 is pushed/published with release/refund, discharge Eric's 2026-06-04 public commitment on aeoess/agent-governance-vocabulary#98 (comment 4619176813). (1) Draft a PR updating crosswalk/budget_reservation.yaml goodmeta `release` cell from '-' (folded into refund) to first-class release, now shipped in @goodmeta/agent-verifier. (2) Draft a #98 follow-up comment pointing at the published release/refund. BOTH show-don't-ship: run 5-perspective council, stage gh commands, operator posts. verify-claims: confirm the cell text + that release/refund is live in the named repo before claiming."
}
```

## What changed this session (chronological, latest first)
- `73a3c21` Reject NaN dates in checkConstraints — expiry-bypass fix (review HIGH). WHY: unparseable validFrom/validUntil silently passed the temporal gate.
- `de98693` Pin deps, clear ws advisory, add CI/SECURITY/CHANGELOG; v0.3.0. WHY: supply-chain + 0 vulns + a real build/test CI gate (was npm-audit only).
- `ea8f05e` Add release()/refund()/createBudget() — lifecycle parity. WHY: enables an honest #98 discharge against the named repo.
- `7ed73bc` Harden VerifierClient: timeouts, typed errors, no blind error parsing. WHY: client blindly `res.json()`'d every response, hid auth/server errors.
- `c4160f3` Validate money inputs with zod; fix budget-inflation bug; add tests. WHY: checkPolicy approved negatives and inflated budget; checkConstraints parseInt-truncated.
- (pre-session HEAD: `5ed04e6` chore(ci): add npm audit gate.)

## Open known issues
- **CRIT-1** sign≠enforce (`src/verify.ts:19-28` vs `checkConstraints`) — operator decision; publish blocked.
- **MED-3** fail-open: `checkConstraints` skips the merchant allowlist when `merchantId` is omitted, and the category gate when `items` is omitted (`src/verify.ts`). Fix: deny when a configured restriction's governing field is absent.
- **LOW-4** EIP-712 domain has no chainId/verifyingContract and no replay nonce → a signed mandate is replayable across deployments/time on the stateless path (largely AP2-inherent). Document as a non-guarantee.
- **LOW-5** `checkPolicy` trusts un-validated `budgetTotal`/`maxPerEvent`/`currentSpend` (`src/policy.ts`) — add `Number.isFinite` guards.
- Cross-repo: `agent-verifier-pro` shares the NaN-date + sign/enforce gaps (deployed).

## Process state
- No background processes running for this repo. The pre-publish review subagent has completed (NOT READY).
- Gate verdict (last run): PASS — build clean, 32/32 tests, 0 vulns.
- Nothing pushed; working tree clean except this HANDOFF.md.

## Files modified this session
- `src/`: `schema.ts` (new — zod Cents + boundary schemas), `verify.ts`, `policy.ts`, `client.ts`, `index.ts`, `types.ts`.
- `test/`: `schema.test.ts`, `policy.test.ts`, `verify.test.ts`, `client.test.ts` (all new; 32 cases, node:test).
- Root/config: `package.json`, `package-lock.json`, `README.md`, `SECURITY.md` (new), `CHANGELOG.md` (new), `.github/workflows/ci.yml` (new).

## Anti-patterns (things the next agent must NOT do)
- Don't `npm publish` / `git push` before a FRESH review returns GOOD TO GO (publish is irreversible).
- Don't change the EIP-712 signed types without first verifying AP2's canonical IntentMandate types — silent interop break.
- Don't claim "production-ready"/"shipped" off self-written tests — only a fresh uber-strict reviewer's GOOD TO GO counts.
- Don't add a money path that bypasses `Cents`.
- Don't post the #98 crosswalk PR/comment yourself — show-don't-ship; operator posts.

## Studies / parked items
- LOW-4 replay/domain hardening (chainId/verifyingContract/nonce) — revisit if/when AP2 canon adds them; for now document the stateless-path non-guarantee.

## Discipline failure post-mortem (most recent)
No incident this session — the opposite. The pre-publish adversarial review (operator-requested) caught a real expiry-bypass (NaN dates) and a sign/enforce scope gap BEFORE anything was published, exactly as the "review money/security paths before they ship" rule intends. The HIGH was fixed with a regression test; the CRITICAL was escalated to the operator rather than patched unilaterally (it's an interop-sensitive crypto change).

## Next concrete action
Get the operator's CRIT-1 decision (extend signed payload vs. document the limitation); then apply remaining review fixes, re-run a fresh review to GOOD TO GO, and only then `git push` + `npm publish` v0.3.0.
