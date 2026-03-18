/**
 * AP2 Mandate Types
 *
 * Core types from the AP2 protocol spec.
 * Used by both the open-source client and the hosted Verifier.
 */

export interface SpendingConstraint {
  maxAmount: string;
  currency: string;
  categories?: string[];
  allowedMerchants?: string[];
  blockedMerchants?: string[];
}

export interface IntentMandate {
  type: "intent-mandate";
  version: "0.1.0";
  id: string;
  user: { id: string };
  agent: { id: string };
  intent: string;
  constraints: SpendingConstraint;
  validFrom: string;
  validUntil: string;
  maxTransactions?: number;
  budgetTotal: string;
  budgetSpent: string;
  userSignature?: string;
}

export interface CartMandate {
  type: "cart-mandate";
  version: "0.1.0";
  id: string;
  merchant: { id: string; name: string; url: string };
  agent: { id: string };
  user: { id: string };
  cart: {
    items: CartItem[];
    total: string;
    currency: string;
  };
  expiresAt: string;
  paymentRails: string[];
  merchantSignature?: string;
  userSignature?: string;
}

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  currency: string;
  category?: string;
}

// --- Verifier API Types ---

export interface VerifyRequest {
  mandate: IntentMandate | CartMandate;
  transaction: {
    amount: string;
    currency: string;
    items?: CartItem[];
    idempotencyKey: string;
  };
}

export interface VerifyResponse {
  approved: boolean;
  verificationId?: string;
  reason?: string;
  detail?: string;
  mandate?: {
    id: string;
    remainingBudget: string;
    remainingTransactions?: number;
    expiresAt: string;
  };
  holdExpiresAt?: string;
}

export interface SettleRequest {
  verificationId: string;
  paymentResult: {
    success: boolean;
    transactionId?: string;
    rail?: string;
  };
}

export interface SettleResponse {
  settled: boolean;
  released?: boolean;
  mandate?: {
    id: string;
    budgetSpent: string;
    remainingBudget: string;
    txCount: number;
  };
}
