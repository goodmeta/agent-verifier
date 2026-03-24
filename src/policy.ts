/**
 * Policy-Based Spending Verification
 *
 * For systems that don't use AP2 mandates (Lago, custom billing, etc).
 * Spending rules are configured via API, not cryptographic signatures.
 *
 * Same core logic: can this agent spend $X on Y right now?
 */

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
  const { constraints } = policy;

  // Per-event max
  if (request.amount > constraints.maxPerEvent) {
    return {
      approved: false,
      reason: "AMOUNT_EXCEEDED",
      detail: `$${(request.amount / 100).toFixed(2)} exceeds per-event max $${(constraints.maxPerEvent / 100).toFixed(2)}`,
    };
  }

  // Budget check
  const remaining = policy.budgetTotal - currentSpend;
  if (request.amount > remaining) {
    return {
      approved: false,
      reason: "BUDGET_EXCEEDED",
      detail: `$${(request.amount / 100).toFixed(2)} exceeds remaining budget $${(remaining / 100).toFixed(2)}`,
      remaining: { budget: remaining, period: policy.budgetPeriod },
    };
  }

  // Code allowlist
  if (request.metadata?.code && constraints.allowedCodes?.length) {
    if (!constraints.allowedCodes.includes(request.metadata.code)) {
      return {
        approved: false,
        reason: "CODE_NOT_ALLOWED",
        detail: `Code "${request.metadata.code}" not in allowed list`,
      };
    }
  }

  // Code blocklist
  if (request.metadata?.code && constraints.blockedCodes?.includes(request.metadata.code)) {
    return {
      approved: false,
      reason: "CODE_BLOCKED",
      detail: `Code "${request.metadata.code}" is blocked`,
    };
  }

  // Customer allowlist
  if (request.metadata?.customer && constraints.allowedCustomers?.length) {
    if (!constraints.allowedCustomers.includes(request.metadata.customer)) {
      return {
        approved: false,
        reason: "CUSTOMER_NOT_ALLOWED",
        detail: `Customer "${request.metadata.customer}" not in allowed list`,
      };
    }
  }

  // Customer blocklist
  if (request.metadata?.customer && constraints.blockedCustomers?.includes(request.metadata.customer)) {
    return {
      approved: false,
      reason: "CUSTOMER_BLOCKED",
      detail: `Customer "${request.metadata.customer}" is blocked`,
    };
  }

  return {
    approved: true,
    remaining: { budget: remaining - request.amount, period: policy.budgetPeriod },
  };
}
