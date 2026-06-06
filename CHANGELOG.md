# Changelog

## 0.3.0

- **Security fix:** money inputs are now validated with zod at the boundary via
  a shared `Cents` validator (positive safe-integer cents). This fixes a
  budget-inflation bug where `checkPolicy` approved a negative amount and
  *increased* the remaining budget, and `parseInt` truncation in
  `checkConstraints` (`"50.99"` → `50`, `"abc"` → `NaN`).
- `VerifierClient` hardened: per-request timeout (`AbortController`), typed
  `VerifierError` (with HTTP `status` + `body`), and no blind parsing of an
  error body as a success response. A denied verification (HTTP 403) is returned
  with `approved: false`, not thrown.
- Added `release()`, `refund()`, and `createBudget()` client methods — lifecycle
  parity with the hosted verifier. New `ReleaseResponse` / `RefundResponse` /
  `MandateSummary` types.
- Added a `node:test` suite (31 cases) and a CI build/test gate.
- Pinned all dependency versions exactly; bumped `viem` to 2.52.2 to clear a
  transitive `ws` advisory.

## 0.2.0

- Renamed to `@goodmeta/agent-verifier`; added policy-based verification
  (`checkPolicy`) and the hosted `VerifierClient`. Added `verifyById`.

## 0.1.0

- Initial release: AP2 mandate signature verification and constraint checking.
