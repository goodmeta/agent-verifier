/**
 * Real AP2 mandate verification — dSD-JWT delegation chains.
 *
 * Ported byte-exact from AP2's reference SDK (pinned commit e1ea56db…) and
 * validated against 65 golden vectors. See AP2-AUDIT.md for the conformance
 * matrix; the verifier is STRICTER than AP2 on every trust decision (ES256 pin,
 * x5c fail-closed, aud+nonce required, self-computed linkage).
 *
 *   import { ap2 } from "@goodmeta/agent-verifier";
 *   const tokens = ap2.splitChain(compactChain);
 *   const payloads = await ap2.verifyChain(
 *     tokens,
 *     ap2.x5cOrKidProvider({ trustedRoots }),   // or pass a key directly
 *     { expectedAud, expectedNonce },
 *   );
 *   const chain = ap2.parsePaymentChain(payloads);
 *   const violations = ap2.verifyPaymentChain(chain, { mandateContext }); // [] = ok
 */

// Chain parsing + walk
export { splitChain, parseToken, type ParsedToken } from "./parse.js";
export { verifyChain, CHAIN_CAPS, type VerifyChainOptions, type RootKeyProvider } from "./chain.js";
export { verifyRootSdJwt, cnfJwk, type ResolvedToken, type VerificationKey } from "./sd-jwt.js";

// Trust anchoring (x5c chain / kid lookup) — fail-closed
export { x5cOrKidProvider, type X5cKidProviderOptions } from "./keys.js";

// Binding / disclosure / linkage hashes
export { computeSdHash, computeIssuerJwtHash, computeValueHash, computeDisclosureDigest } from "./hash.js";

// Strict EC P-256 JWK
export { JwkSchema, parseJwk, type Jwk } from "./jwk.js";

// Typed chains + linkage + receipt reference
export {
  parsePaymentChain,
  verifyPaymentChain,
  parseCheckoutChain,
  verifyCheckoutChain,
  extractCheckout,
  receiptReference,
  getClosedMandateJwt,
  type PaymentChain,
  type CheckoutChain,
  type VerifyPaymentChainOptions,
  type VerifyCheckoutChainOptions,
} from "./chains.js";

// Constraint evaluation (closed-world: unknown constraint ⇒ violation)
export { checkPaymentConstraints, checkCheckoutConstraints, merchantMatches } from "./constraints.js";

// Mandate schemas + inferred types (snake_case, vct pinned exact)
export {
  OpenPaymentMandateSchema,
  PaymentMandateSchema,
  OpenCheckoutMandateSchema,
  CheckoutMandateSchema,
  CheckoutSchema,
  type OpenPaymentMandate,
  type PaymentMandate,
  type OpenCheckoutMandate,
  type CheckoutMandate,
  type Checkout,
  type MandateContext,
} from "./types.js";
