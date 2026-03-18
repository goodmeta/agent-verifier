/**
 * Mandate Signing
 *
 * EIP-712 signing for AP2 mandates.
 * Used by agents/users to sign mandates, and by merchants
 * to sign cart price commitments.
 */

import type { PrivateKeyAccount } from "viem";
import type { IntentMandate, CartMandate } from "./types.js";
import { AP2_DOMAIN, INTENT_MANDATE_TYPES, CART_MANDATE_TYPES } from "./verify.js";

/**
 * User signs an Intent Mandate — pre-authorizing autonomous spending.
 */
export async function signIntentMandate(
  mandate: IntentMandate,
  userAccount: PrivateKeyAccount
): Promise<string> {
  return userAccount.signTypedData({
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
  });
}

/**
 * Merchant signs a Cart Mandate — committing to price.
 */
export async function signCartMandate(
  mandate: CartMandate,
  merchantAccount: PrivateKeyAccount
): Promise<string> {
  return merchantAccount.signTypedData({
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
  });
}

/**
 * User approves a Cart Mandate — authorizing the purchase.
 */
export async function approveCartMandate(
  mandate: CartMandate,
  userAccount: PrivateKeyAccount
): Promise<string> {
  return userAccount.signTypedData({
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
  });
}
