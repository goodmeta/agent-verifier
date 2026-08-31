/**
 * Typed mandate-chain wrappers + linkage + receipt reference.
 *
 * Ports AP2's `payment_mandate_chain.py` / `checkout_mandate_chain.py`: the
 * per-hop effective payloads from `verifyChain` are parsed into a typed
 * `[open, closed]` pair, then constraints are evaluated.
 *
 * Hardening H6 (stricter than AP2): AP2 takes the `transaction_id` /
 * `checkout_hash` linkage as caller-supplied. We SELF-COMPUTE the
 * `checkout_hash` from the embedded `checkout_jwt` and require it to match the
 * mandate's own `checkout_hash` (mandatory) before evaluating constraints — a
 * caller can't assert a linkage the bytes don't support.
 */

import { Buffer } from "node:buffer";
import { computeValueHash, computeSdHash } from "./hash.js";
import { canonicalChainSegment, parseToken } from "./parse.js";
import {
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
import { checkPaymentConstraints, checkCheckoutConstraints } from "./constraints.js";

const JWT_COMPACT_PARTS = 3;

// ── Payment chain ────────────────────────────────────────────────────────────

export interface PaymentChain {
  open: OpenPaymentMandate;
  closed: PaymentMandate;
}

/** Parse exactly two verified payloads into a typed payment chain. */
export function parsePaymentChain(payloads: unknown[]): PaymentChain {
  if (payloads.length !== 2) {
    throw new Error(`Payment mandate chain requires exactly 2 payloads, got ${payloads.length}`);
  }
  return {
    open: OpenPaymentMandateSchema.parse(payloads[0]),
    closed: PaymentMandateSchema.parse(payloads[1]),
  };
}

export interface VerifyPaymentChainOptions {
  /** The verified open-checkout-mandate hash to bind to (H6: pass the value
   * self-computed by `verifyCheckoutChain`, not a caller assertion). */
  expectedTransactionId?: string;
  openCheckoutHash?: string;
  mandateContext?: MandateContext;
  /**
   * Constraint types the caller requires to have been enforced on this mandate,
   * e.g. `["payment.budget"]`. Forwarded to `checkPaymentConstraints`: a required
   * constraint absent from the open mandate was never evaluated, so it is
   * reported rather than passing silently. Opt-in; omit it for AP2 parity.
   */
  requiredConstraints?: string[];
}

/** Verify a payment chain's constraints + linkage. Returns [] when satisfied. */
export function verifyPaymentChain(chain: PaymentChain, opts: VerifyPaymentChainOptions = {}): string[] {
  const violations = checkPaymentConstraints(chain.open, chain.closed, {
    openCheckoutHash: opts.openCheckoutHash,
    mandateContext: opts.mandateContext,
    requiredConstraints: opts.requiredConstraints,
  });
  if (opts.expectedTransactionId !== undefined && opts.expectedTransactionId !== chain.closed.transaction_id) {
    violations.push(
      `Payment transaction_id mismatch: expected ${opts.expectedTransactionId}, got ${chain.closed.transaction_id}`,
    );
  }
  return violations;
}

// ── Checkout chain ───────────────────────────────────────────────────────────

export interface CheckoutChain {
  open: OpenCheckoutMandate;
  closed: CheckoutMandate;
}

export function parseCheckoutChain(payloads: unknown[]): CheckoutChain {
  if (payloads.length !== 2) {
    throw new Error(`Checkout mandate chain requires exactly 2 payloads, got ${payloads.length}`);
  }
  return {
    open: OpenCheckoutMandateSchema.parse(payloads[0]),
    closed: CheckoutMandateSchema.parse(payloads[1]),
  };
}

/** Decode the `Checkout` object from a `checkout_jwt` payload (port of
 * `extract_parsed_checkout_object`). The merchant signature is out of AP2's
 * scope (CHK-07); only the payload is decoded + schema-validated. */
export function extractCheckout(checkoutJwt: string): Checkout {
  const parts = checkoutJwt.split(".");
  if (parts.length !== JWT_COMPACT_PARTS) {
    throw new Error("Malformed checkout_jwt: expected header.payload.signature");
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (e) {
    throw new Error(`Invalid checkout_jwt payload: ${(e as Error).message}`);
  }
  return CheckoutSchema.parse(json);
}

export interface VerifyCheckoutChainOptions {
  /** `_sd_alg` of the closed mandate's SD-JWT (defaults to sha-256). */
  sdAlg?: string;
  expectedCheckoutHash?: string;
}

/**
 * Verify a checkout chain: self-compute `checkout_hash` from the embedded
 * `checkout_jwt` and require it to match the mandate (H6), then evaluate the
 * open mandate's constraints against the decoded checkout. Returns [].
 */
export function verifyCheckoutChain(chain: CheckoutChain, opts: VerifyCheckoutChainOptions = {}): string[] {
  const violations: string[] = [];

  // H6 — self-computed linkage is mandatory.
  const computed = computeValueHash(chain.closed.checkout_jwt, opts.sdAlg);
  if (computed !== chain.closed.checkout_hash) {
    violations.push(
      `Self-computed checkout_hash mismatch: hash(checkout_jwt)=${computed}, mandate checkout_hash=${chain.closed.checkout_hash}`,
    );
    return violations; // do not evaluate constraints against an unbound checkout
  }

  let checkout: Checkout;
  try {
    checkout = extractCheckout(chain.closed.checkout_jwt);
  } catch (e) {
    return [(e as Error).message];
  }
  violations.push(...checkCheckoutConstraints(chain.open, checkout));

  if (opts.expectedCheckoutHash !== undefined && opts.expectedCheckoutHash !== chain.closed.checkout_hash) {
    violations.push(
      `Checkout checkout_hash mismatch: expected ${opts.expectedCheckoutHash}, got ${chain.closed.checkout_hash}`,
    );
  }
  return violations;
}

// ── Receipt reference ────────────────────────────────────────────────────────

/** The closed-mandate leaf JWT of a chain (port of `get_closed_mandate_jwt`):
 * the bare issuer JWT (no disclosures) of the final `~~`-separated segment.
 *
 * NOTE: this is for embedding/identifying the closed mandate. It is NOT the
 * receipt-reference input — use `receiptReference()` for that. (AP2's SDK
 * `get_closed_mandate_jwt` docstring suggests `sha256` of this string as the
 * reference, but the AP2 spec (AUTH-17) defines the reference as `sd_hash` over
 * the final SD-JWT *including disclosures*; we follow the spec. The two differ.)
 */
export function getClosedMandateJwt(presentationToken: string): string {
  const lastSegment = presentationToken.split("~~").at(-1) as string;
  return lastSegment.split("~", 1)[0];
}

/**
 * Stable receipt `reference` for a chain (AUTH-17 / SPEC-6): the base64url hash
 * of the FINAL SD-JWT in the chain, computed "in the same manner as `sd_hash`"
 * — i.e. `sd_hash` over the last segment's canonical SD-JWT form (issuer JWT +
 * disclosures). This is the spec-authoritative reference; it is deliberately
 * NOT `sha256(getClosedMandateJwt(chain))` (see that function's note).
 */
export function receiptReference(presentationToken: string): string {
  const segments = presentationToken.split("~~");
  const last = parseToken(canonicalChainSegment(segments.at(-1) as string, segments.length - 1, segments.length));
  return computeSdHash(last);
}
