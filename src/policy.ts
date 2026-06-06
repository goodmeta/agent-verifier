/**
 * Policy-Based Spending Verification
 *
 * For systems that don't use AP2 mandates (Lago, custom billing, etc).
 * Spending rules are configured via API, not cryptographic signatures.
 *
 * Same core logic: can this agent spend $X on Y right now?
 */

import { PolicyRequestSchema } from "./schema.js";

export interface SpendingPolicy {
  agentId: string;
  budgetTotal: number;
  budgetPeriod: "daily" | "weekly" | "monthly" | "total";
  constraints: {
    maxPerEvent: number;
    allowedCodes?: string[];
    blockedCodes?: string[];
    allowedCustomers?: string[];
    blockedCustomers?: string[];
  };
}

export interface PolicyVerifyRequest {
  agentId: string;
  amount: number;
  metadata?: {
    code?: string;
    customer?: string;
    [key: string]: unknown;
  };
  idempotencyKey: string;
}

export interface PolicyVerifyResponse {
  approved: boolean;
  reason?: string;
  detail?: string;
  remaining?: {
    budget: number;
    period: string;
  };
}

/**
 * Check a spending request against a local policy (stateless).
 * For cross-agent budget tracking, use the hosted Verifier.
 */
export function checkPolicy(
  policy: SpendingPolicy,
  request: PolicyVerifyRequest,
  currentSpend: number = 0
): PolicyVerifyResponse {
  // Validate the untrusted request at the boundary. `amount` is coerced to
  // positive integer cents — a negative amount would otherwise pass every ">"
  // check below and then inflate the remaining budget (remaining - (-x)).
  const parsed = PolicyRequestSchema.safeParse(request);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      approved: false,
      reason: issue?.path[0] === "amount" ? "INVALID_AMOUNT" : "INVALID_REQUEST",
      detail: issue?.message ?? "invalid request",
    };
  }
  const { amount, metadata } = parsed.data;

  const { constraints } = policy;

  // Per-event max
  if (amount > constraints.maxPerEvent) {
    return {
      approved: false,
      reason: "AMOUNT_EXCEEDED",
      detail: `$${(amount / 100).toFixed(2)} exceeds per-event max $${(constraints.maxPerEvent / 100).toFixed(2)}`,
    };
  }

  // Budget check
  const remaining = policy.budgetTotal - currentSpend;
  if (amount > remaining) {
    return {
      approved: false,
      reason: "BUDGET_EXCEEDED",
      detail: `$${(amount / 100).toFixed(2)} exceeds remaining budget $${(remaining / 100).toFixed(2)}`,
      remaining: { budget: remaining, period: policy.budgetPeriod },
    };
  }

  // Code allowlist
  if (metadata?.code && constraints.allowedCodes?.length) {
    if (!constraints.allowedCodes.includes(metadata.code)) {
      return {
        approved: false,
        reason: "CODE_NOT_ALLOWED",
        detail: `Code "${metadata.code}" not in allowed list`,
      };
    }
  }

  // Code blocklist
  if (metadata?.code && constraints.blockedCodes?.includes(metadata.code)) {
    return {
      approved: false,
      reason: "CODE_BLOCKED",
      detail: `Code "${metadata.code}" is blocked`,
    };
  }

  // Customer allowlist
  if (metadata?.customer && constraints.allowedCustomers?.length) {
    if (!constraints.allowedCustomers.includes(metadata.customer)) {
      return {
        approved: false,
        reason: "CUSTOMER_NOT_ALLOWED",
        detail: `Customer "${metadata.customer}" not in allowed list`,
      };
    }
  }

  // Customer blocklist
  if (metadata?.customer && constraints.blockedCustomers?.includes(metadata.customer)) {
    return {
      approved: false,
      reason: "CUSTOMER_BLOCKED",
      detail: `Customer "${metadata.customer}" is blocked`,
    };
  }

  return {
    approved: true,
    remaining: { budget: remaining - amount, period: policy.budgetPeriod },
  };
}
