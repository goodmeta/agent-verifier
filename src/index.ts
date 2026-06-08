/**
 * @goodmeta/agent-verifier
 *
 * Agent spending verification — open source.
 *
 * Real AP2 mandate verification (dSD-JWT delegation chains) — the headline:
 *   import { ap2 } from "@goodmeta/agent-verifier";
 *   const payloads = await ap2.verifyChain(ap2.splitChain(chain), key, { expectedAud, expectedNonce });
 *   const violations = ap2.verifyPaymentChain(ap2.parsePaymentChain(payloads));
 *
 * Receipt signing & verification (ES256 JWS — AP2's *receipt* format):
 *   import { signReceipt, verifyReceipt } from "@goodmeta/agent-verifier";
 *
 * Hosted Verifier API (cross-agent budget state) + policy engine:
 *   import { VerifierClient, checkPolicy } from "@goodmeta/agent-verifier";
 */

// ── Real AP2 mandate verification (dSD-JWT) — see src/ap2 + AP2-AUDIT.md ──────
export * as ap2 from "./ap2/index.js";

// ── Receipt signing & verification — ES256 JWS, AP2's receipt format ─────────
export { signReceipt, verifyReceipt } from "./receipt-jwt.js";
export type { VerifiedReceipt, JWK } from "./receipt-jwt.js";

// ── Hosted Verifier API + policy engine (non-AP2 billing systems) ────────────
export { checkPolicy } from "./policy.js";
export type { SpendingPolicy, PolicyVerifyRequest, PolicyVerifyResponse } from "./policy.js";
export { VerifierClient, VerifierError } from "./client.js";
export type { VerifierClientOptions, VerifyByIdTransaction } from "./client.js";

// Input validation schemas (zod) — boundary validators + shared cents rule
export { parseCents, Cents, ConstraintTxSchema, PolicyRequestSchema } from "./schema.js";

// ── LEGACY (pre-AP2) hosted-API types — camelCase, NOT the AP2 dSD-JWT mandate
//    model. Retained for the hosted Verifier client API; new integrations
//    should use the snake_case `ap2.*` mandate schemas above. ─────────────────
export { checkConstraints } from "./verify.js";
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
