/**
 * Stateless Mandate Verification
 *
 * Open-source verification primitives:
 * - EIP-712 signature verification
 * - Constraint checking (budget, merchant, category, temporal)
 *
 * These work for single-merchant self-hosted verification.
 * For cross-merchant budget tracking, use the hosted Verifier API
 * via the VerifierClient class.
 */

import { verifyTypedData, type Address } from "viem";
import type { IntentMandate, CartMandate, CartItem } from "./types.js";
import { parseCents, ConstraintTxSchema } from "./schema.js";

// EIP-712 domain + types (must match AP2 spec)
const AP2_DOMAIN = { name: "AP2", version: "0.1.0" } as const;

const INTENT_MANDATE_TYPES = {
  IntentMandate: [
    { name: "id", type: "string" },
    { name: "intent", type: "string" },
    { name: "maxAmount", type: "string" },
    { name: "currency", type: "string" },
    { name: "validUntil", type: "string" },
    { name: "budgetTotal", type: "string" },
  ],
} as const;

const CART_MANDATE_TYPES = {
  CartMandate: [
    { name: "id", type: "string" },
    { name: "merchantId", type: "string" },
    { name: "total", type: "string" },
    { name: "currency", type: "string" },
    { name: "expiresAt", type: "string" },
  ],
} as const;

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify an Intent Mandate's EIP-712 signature.
 */
export async function verifyIntentSignature(
  mandate: IntentMandate
): Promise<VerificationResult> {
  if (!mandate.userSignature) {
    return { valid: false, error: "Missing user signature" };
  }

  try {
    const valid = await verifyTypedData({
      address: mandate.user.id as Address,
      domain: AP2_DOMAIN,
      types: INTENT_MANDATE_TYPES,
      primaryType: "IntentMandate",
      message: {
        id: mandate.id,
        intent: mandate.intent,
        maxAmount: mandate.constraints.maxAmount,
        currency: mandate.constraints.currency,
        validUntil: mandate.validUntil,
        budgetTotal: mandate.budgetTotal,
      },
      signature: mandate.userSignature as `0x${string}`,
    });
    return valid ? { valid: true } : { valid: false, error: "Invalid signature" };
  } catch {
    return { valid: false, error: "Signature verification failed" };
  }
}

/**
 * Verify a Cart Mandate's EIP-712 signature (user side).
 */
export async function verifyCartSignature(
  mandate: CartMandate
): Promise<VerificationResult> {
  if (!mandate.userSignature) {
    return { valid: false, error: "Missing user signature" };
  }

  try {
    const valid = await verifyTypedData({
      address: mandate.user.id as Address,
      domain: AP2_DOMAIN,
      types: CART_MANDATE_TYPES,
      primaryType: "CartMandate",
      message: {
        id: mandate.id,
        merchantId: mandate.merchant.id,
        total: mandate.cart.total,
        currency: mandate.cart.currency,
        expiresAt: mandate.expiresAt,
      },
      signature: mandate.userSignature as `0x${string}`,
    });
    return valid ? { valid: true } : { valid: false, error: "Invalid signature" };
  } catch {
    return { valid: false, error: "Signature verification failed" };
  }
}

/**
 * Check Intent Mandate constraints against a proposed transaction.
 * Stateless — does NOT track budget across transactions.
 * For cross-merchant budget tracking, use the hosted Verifier.
 */
export function checkConstraints(
  mandate: IntentMandate,
  transaction: { amount: string; merchantId?: string; items?: CartItem[] }
): VerificationResult {
  // Validate the untrusted transaction at the boundary. `amount` is coerced to
  // positive integer cents; malformed input can't slip past the checks below.
  const parsed = ConstraintTxSchema.safeParse(transaction);
  if (!parsed.success) {
    return { valid: false, error: parsed.error.issues[0]?.message ?? "Invalid transaction" };
  }
  const { amount, merchantId, items } = parsed.data;

  const now = new Date();
  const c = mandate.constraints;

  // Temporal
  if (new Date(mandate.validFrom) > now) {
    return { valid: false, error: `Mandate not yet valid (from ${mandate.validFrom})` };
  }
  if (new Date(mandate.validUntil) < now) {
    return { valid: false, error: "Mandate expired" };
  }

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

  // Merchant allowlist
  if (merchantId && c.allowedMerchants?.length) {
    if (!c.allowedMerchants.includes(merchantId)) {
      return { valid: false, error: `Merchant ${merchantId} not in allowlist` };
    }
  }

  // Merchant blocklist
  if (merchantId && c.blockedMerchants?.includes(merchantId)) {
    return { valid: false, error: `Merchant ${merchantId} is blocked` };
  }

  // Category check
  if (c.categories?.length && items?.length) {
    for (const item of items) {
      if (item.category && !c.categories.includes(item.category)) {
        return { valid: false, error: `Category "${item.category}" not allowed` };
      }
    }
  }

  return { valid: true };
}

// Re-export signing constants for custom implementations
export { AP2_DOMAIN, INTENT_MANDATE_TYPES, CART_MANDATE_TYPES };
