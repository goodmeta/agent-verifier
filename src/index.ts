/**
 * @goodmeta/agent-verifier
 *
 * Agent spending verification — open source.
 *
 * Mandate signing & verification (ES256 JWS, matching AP2):
 *   import { signMandate, verifyMandate } from "@goodmeta/agent-verifier";
 *
 * Constraint checking on a verified mandate:
 *   import { checkConstraints } from "@goodmeta/agent-verifier";
 *
 * Policy-based verification (non-AP2 billing systems):
 *   import { checkPolicy } from "@goodmeta/agent-verifier";
 *
 * Hosted Verifier API (cross-agent budget state):
 *   import { VerifierClient } from "@goodmeta/agent-verifier";
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
  MandateSummary,
  ReleaseResponse,
  RefundResponse,
} from "./types.js";

// Mandate signing & verification — ES256 JWS (JWT), the mechanism AP2 uses
export { signMandate, verifyMandate } from "./mandate-jwt.js";
export type { VerifiedMandate, JWK } from "./mandate-jwt.js";

// Constraint checking on a verified mandate (stateless)
export { checkConstraints } from "./verify.js";

// Policy-based verification (non-AP2 billing systems)
export { checkPolicy } from "./policy.js";
export type { SpendingPolicy, PolicyVerifyRequest, PolicyVerifyResponse } from "./policy.js";

// Hosted Verifier client (cross-agent budget state)
export { VerifierClient, VerifierError } from "./client.js";
export type { VerifierClientOptions, VerifyByIdTransaction } from "./client.js";

// Input validation schemas (zod) — boundary validators + shared cents rule
export { parseCents, Cents, ConstraintTxSchema, PolicyRequestSchema } from "./schema.js";
