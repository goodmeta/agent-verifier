# Changelog

## 0.4.0

- **Mandate signing/verification now uses ES256 JWS (JWT) over the whole mandate
  — matching AP2** (AP2 signs mandates as ES256 JWS via `jwcrypto`; we use `jose`).
  This replaces the prior **EIP-712** scheme, which signed only a subset of fields
  — so `allowedMerchants`, `categories`, and `validFrom` were *enforced* but *not
  signed*, meaning a validly-signed mandate's scope could be altered without
  breaking the signature. The whole payload is now signed. **Breaking.**
- New `signMandate(mandate, jwk)` / `verifyMandate(token, jwk)`. Removed
  `verifyIntentSignature` / `verifyCartSignature` / `signIntentMandate` /
  `signCartMandate` / `approveCartMandate` and the EIP-712 constants. Dropped the
  `viem` dependency; added `jose`.
- `checkConstraints` no longer fails open: a configured allowlist with a missing
  `merchantId`, or a category restriction with no items, now denies. Unparseable
  `validFrom`/`validUntil` are rejected (was a NaN-comparison expiry bypass).
- Money inputs validated with zod at the boundary via a shared `Cents` rule
  (fixes a `checkPolicy` bug where a negative amount was approved and inflated the
  budget, and `parseInt` truncation in `checkConstraints`).
- `VerifierClient` hardened (per-request timeout, typed `VerifierError`, no blind
  error-body parsing); added `release()` / `refund()` / `createBudget()`.
- `node:test` suite (35 cases) + CI build/test gate. All deps exact-pinned.

> Note: `0.2.x` used the non-AP2 EIP-712 scheme and overstated AP2 compatibility.
> Upgrade to `0.4.0`.

## 0.2.0

- Renamed to `@goodmeta/agent-verifier`; added policy-based verification
  (`checkPolicy`) and the hosted `VerifierClient`. Added `verifyById`.

## 0.1.0

- Initial release: mandate signature verification (EIP-712) and constraint checking.
