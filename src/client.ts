/**
 * Verifier API Client
 *
 * For merchants integrating with the hosted Good Meta Verifier.
 * Cross-merchant budget tracking, hold management, audit trail.
 *
 * Usage:
 *   import { VerifierClient } from "@goodmeta/agent-verifier";
 *
 *   const verifier = new VerifierClient({
 *     apiKey: "gm_live_...",
 *     baseUrl: "https://verifier.goodmeta.co", // or self-hosted
 *   });
 *
 *   const result = await verifier.verify(mandate, { amount: "3000", ... });
 *   if (result.approved) {
 *     // process payment
 *     await verifier.settle(result.verificationId, { success: true, ... });
 *   }
 */

import type {
  IntentMandate,
  CartMandate,
  CartItem,
  VerifyResponse,
  SettleResponse,
} from "./types.js";

export interface VerifyByIdTransaction {
  amount: string;
  currency: string;
  items?: CartItem[];
  idempotencyKey: string;
}

export interface VerifierClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export class VerifierClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: VerifierClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://verifier.goodmeta.co").replace(/\/$/, "");
  }

  /**
   * Verify a mandate and place a budget hold.
   * Call this BEFORE processing payment.
   */
  async verify(
    mandate: IntentMandate | CartMandate,
    transaction: {
      amount: string;
      currency: string;
      items?: CartItem[];
      idempotencyKey: string;
    }
  ): Promise<VerifyResponse> {
    const res = await fetch(`${this.baseUrl}/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ mandate, transaction }),
    });
    return res.json() as Promise<VerifyResponse>;
  }

  /**
   * Verify by mandate/policy ID — for integrations where the agent
   * only passes an ID (e.g. cart metadata), not the full mandate object.
   * The hosted Verifier already has the mandate on file.
   */
  async verifyById(
    mandateId: string,
    transaction: VerifyByIdTransaction
  ): Promise<VerifyResponse> {
    const res = await fetch(`${this.baseUrl}/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ mandateId, transaction }),
    });
    return res.json() as Promise<VerifyResponse>;
  }

  /**
   * Settle a verification after payment succeeds or fails.
   * If success=true, budget is permanently debited.
   * If success=false, hold is released and budget restored.
   */
  async settle(
    verificationId: string,
    paymentResult: {
      success: boolean;
      transactionId?: string;
      rail?: string;
    }
  ): Promise<SettleResponse> {
    const res = await fetch(`${this.baseUrl}/v1/settle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ verificationId, paymentResult }),
    });
    return res.json() as Promise<SettleResponse>;
  }

  /**
   * Query mandate state — budget, transaction count, history.
   */
  async getMandateState(mandateId: string): Promise<{
    mandate: {
      id: string;
      budgetTotal: string;
      budgetSpent: string;
      remainingBudget: string;
      txCount: number;
    };
    transactions: Array<{
      verification_id: string;
      merchant_name: string;
      amount: number;
      status: string;
      payment_rail: string | null;
    }>;
  }> {
    const res = await fetch(`${this.baseUrl}/v1/mandates/${mandateId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return res.json();
  }
}
