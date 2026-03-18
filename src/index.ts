/**
 * @goodmeta/ap2-verifier
 *
 * AP2 mandate verification — open source.
 *
 * Stateless verification (self-host):
 *   import { verifyIntentSignature, checkConstraints } from "@goodmeta/ap2-verifier";
 *
 * Hosted Verifier API (cross-merchant):
 *   import { VerifierClient } from "@goodmeta/ap2-verifier";
 */

// Types
export type {
  IntentMandate,
  CartMandate,
  CartItem,
  SpendingConstraint,
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
} from "./types.js";

// Stateless verification (open source, self-hostable)
export {
  verifyIntentSignature,
  verifyCartSignature,
  checkConstraints,
  AP2_DOMAIN,
  INTENT_MANDATE_TYPES,
  CART_MANDATE_TYPES,
} from "./verify.js";

// Signing
export {
  signIntentMandate,
  signCartMandate,
  approveCartMandate,
} from "./sign.js";

// Hosted Verifier client (for cross-merchant state)
export { VerifierClient } from "./client.js";
export type { VerifierClientOptions } from "./client.js";
