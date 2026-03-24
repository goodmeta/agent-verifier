/**
 * @goodmeta/agent-verifier
 *
 * Agent spending verification — open source.
 *
 * AP2 mandate verification (self-host):
 *   import { verifyIntentSignature, checkConstraints } from "@goodmeta/agent-verifier";
 *
 * Policy-based verification (Lago, custom billing):
 *   import { checkPolicy } from "@goodmeta/agent-verifier";
 *
 * Hosted Verifier API (cross-agent state):
 *   import { VerifierClient } from "@goodmeta/agent-verifier";
 */

// AP2 Types
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

// AP2 Stateless verification (open source, self-hostable)
export {
  verifyIntentSignature,
  verifyCartSignature,
  checkConstraints,
  AP2_DOMAIN,
  INTENT_MANDATE_TYPES,
  CART_MANDATE_TYPES,
} from "./verify.js";

// AP2 Signing
export {
  signIntentMandate,
  signCartMandate,
  approveCartMandate,
} from "./sign.js";

// Policy-based verification (Lago, custom billing, non-AP2)
export { checkPolicy } from "./policy.js";
export type {
  SpendingPolicy,
  PolicyVerifyRequest,
  PolicyVerifyResponse,
} from "./policy.js";

// Hosted Verifier client (for cross-agent state)
export { VerifierClient } from "./client.js";
export type { VerifierClientOptions, VerifyByIdTransaction } from "./client.js";
