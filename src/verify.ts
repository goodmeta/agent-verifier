/**
 * Constraint checking for a verified mandate.
 *
 * Signature verification lives in receipt-jwt.ts (ES256 JWS — AP2's receipt
 * format). Once a mandate's signature is verified there, the WHOLE payload is
 * trusted, and these checks enforce the spending constraints it carries. There
 * is no "signed subset vs enforced superset" gap: every field was under the JWS.
 */

import type { IntentMandate, CartItem } from "./types.js";
import { parseCents, ConstraintTxSchema } from "./schema.js";

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check an Intent Mandate's constraints against a proposed transaction.
 * Stateless — does NOT track budget across transactions. For cross-merchant
 * budget tracking, use the hosted Verifier (VerifierClient).
 */
export function checkConstraints(
  mandate: IntentMandate,
  transaction: { amount: string; merchantId?: string; items?: CartItem[] }
): VerificationResult {
  const parsed = ConstraintTxSchema.safeParse(transaction);
  if (!parsed.success) {
    return { valid: false, error: parsed.error.issues[0]?.message ?? "Invalid transaction" };
  }
  const { amount, merchantId, items } = parsed.data;
  const c = mandate.constraints;

  // Temporal — parse explicitly and reject NaN. `new Date("garbage") > now` AND
  // `< now` are both false, which would silently disable the expiry gate.
  const now = Date.now();
  const validFrom = Date.parse(mandate.validFrom);
  const validUntil = Date.parse(mandate.validUntil);
  if (Number.isNaN(validFrom) || Number.isNaN(validUntil)) {
    return { valid: false, error: "Mandate has an invalid or missing validFrom/validUntil" };
  }
  if (validFrom > now) return { valid: false, error: `Mandate not yet valid (from ${mandate.validFrom})` };
  if (validUntil < now) return { valid: false, error: "Mandate expired" };

  // Per-transaction max
  const maxAmount = parseCents(c.maxAmount);
  if (maxAmount === null) {
    return { valid: false, error: "Mandate maxAmount is not a valid positive integer (cents)" };
  }
  if (amount > maxAmount) {
    return {
      valid: false,
      error: `$${(amount / 100).toFixed(2)} exceeds per-transaction max $${(maxAmount / 100).toFixed(2)}`,
    };
  }

  // Merchant allowlist — if configured, a missing merchantId is a denial, not a skip.
  if (c.allowedMerchants?.length) {
    if (!merchantId || !c.allowedMerchants.includes(merchantId)) {
      return { valid: false, error: `Merchant ${merchantId ?? "(none)"} not in allowlist` };
    }
  }

  // Merchant blocklist
  if (merchantId && c.blockedMerchants?.includes(merchantId)) {
    return { valid: false, error: `Merchant ${merchantId} is blocked` };
  }

  // Category — under a category restriction every item must carry an allowed
  // category; a transaction with no items can't be category-verified, so deny.
  if (c.categories?.length) {
    if (!items?.length) {
      return { valid: false, error: "Category-restricted mandate requires an itemized transaction" };
    }
    for (const item of items) {
      if (!item.category || !c.categories.includes(item.category)) {
        return { valid: false, error: `Category "${item.category ?? "(none)"}" not allowed` };
      }
    }
  }

  return { valid: true };
}
