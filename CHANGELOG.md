# Changelog

## 0.5.0

- **Real AP2 mandate verification — `ap2.*` namespace.** AP2 mandates are
  **dSD-JWT delegation chains** (issuer-signed SD-JWT root + KB-SD-JWT hops,
  `cnf.jwk` hop-chaining, `sd_hash`/`issuer_jwt_hash` binding, ES256/P-256), not
  plain signed JSON. The new verifier walks the chain (`ap2.verifyChain`),
  resolves disclosures, enforces binding + typ + terminal aud/nonce, anchors
  trust via a fail-closed `x5c`/`kid` provider (`ap2.x5cOrKidProvider`), types
  the `[open, closed]` pair (`ap2.parsePaymentChain` / `ap2.parseCheckoutChain`),
  evaluates all 8 payment + 2 checkout constraints (incl. line-items max-flow),
  self-computes the `checkout_hash`/`transaction_id` linkage, and computes the
  receipt `reference`. **Ported byte-exact from AP2's reference SDK** (pinned
  commit) and validated against **65 golden vectors**; STRICTER than AP2 on every
  trust decision. Conformance matrix: `AP2-AUDIT.md`.
- **Honesty:** prior versions (`< 0.5`) did **not** verify real AP2 mandates —
  `0.2.x` used EIP-712, `0.4.0` used plain whole-payload ES256 JWS (which is
  AP2's *receipt* format, not its *mandate* format).
- **Renamed** `signMandate`/`verifyMandate` → `signReceipt`/`verifyReceipt`
  (`receipt-jwt.ts`): plain ES256 JWS IS AP2's receipt format. The result field
  is now `payload` (was `mandate`). **Breaking.** The legacy camelCase
  `IntentMandate`/`CartMandate` + `checkConstraints` remain (hosted-API model),
  now clearly marked legacy; new integrations use the `ap2.*` snake_case schemas.
- No new runtime dependencies (disclosure math is a native port of AP2's Python
  `sd_jwt` lib, not `@sd-jwt/*`). All deps stay exact-pinned.

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
