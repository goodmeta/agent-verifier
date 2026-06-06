/**
 * Verifier API Client
 *
 * For merchants integrating with the hosted Good Meta Verifier.
 * Cross-merchant budget tracking, hold management, audit trail.
 *
 * Every call applies a timeout, surfaces transport/auth/server/non-JSON failures
 * as a typed VerifierError, and never blind-parses an error body as a success
 * response. A *denied* verification (HTTP 403 with { approved: false }) is a
 * normal domain outcome and is returned, not thrown.
 *
 *   import { VerifierClient, VerifierError } from "@goodmeta/agent-verifier";
 *
 *   const verifier = new VerifierClient({ apiKey: "gm_test_..." });
 *   const result = await verifier.verify(mandate, { amount: "3000", currency: "USDC", idempotencyKey: "tx-1" });
 *   if (result.approved) await verifier.settle(result.verificationId!, { success: true });
 */

import type {
  IntentMandate,
  CartMandate,
  CartItem,
  VerifyResponse,
  SettleResponse,
  ReleaseResponse,
  RefundResponse,
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
  /** Per-request timeout in milliseconds. Default 10_000. */
  timeoutMs?: number;
  /** Override the fetch implementation (testing / custom agents). Defaults to global fetch. */
  fetch?: typeof fetch;
}

/**
 * Thrown for transport, timeout, auth (401), client (4xx), server (5xx), or
 * non-JSON failures. Business outcomes (e.g. a denied verification) are
 * returned, not thrown. Carries the HTTP `status` and parsed `body` when available.
 */
export class VerifierError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  constructor(message: string, opts: { status?: number; body?: unknown; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "VerifierError";
    this.status = opts.status;
    this.body = opts.body;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class VerifierClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: VerifierClientOptions) {
    if (!options.apiKey) throw new VerifierError("apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://verifier.goodmeta.co").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /**
   * Low-level request: applies auth header + timeout, returns { status, body }.
   * Throws VerifierError on network failure, timeout (AbortError), or a body
   * that isn't valid JSON.
   */
  private async raw(
    path: string,
    init: { method: string; body?: string }
  ): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: init.body,
        signal: controller.signal,
      });
    } catch (cause) {
      const aborted = (cause as { name?: string } | null)?.name === "AbortError";
      throw new VerifierError(
        aborted
          ? `${init.method} ${path} timed out after ${this.timeoutMs}ms`
          : `${init.method} ${path} failed: ${(cause as Error)?.message ?? "network error"}`,
        { cause },
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new VerifierError(`non-JSON response from ${path} (HTTP ${res.status})`, {
          status: res.status,
          body: text,
        });
      }
    }
    return { status: res.status, body };
  }

  /** POST that throws VerifierError on any non-2xx. */
  private async post<T>(path: string, payload: unknown): Promise<T> {
    const { status, body } = await this.raw(path, { method: "POST", body: JSON.stringify(payload) });
    if (status >= 200 && status < 300) return body as T;
    throw new VerifierError(`POST ${path} failed (HTTP ${status})`, { status, body });
  }

  /** GET that throws VerifierError on any non-2xx. */
  private async get<T>(path: string): Promise<T> {
    const { status, body } = await this.raw(path, { method: "GET" });
    if (status >= 200 && status < 300) return body as T;
    throw new VerifierError(`GET ${path} failed (HTTP ${status})`, { status, body });
  }

  /**
   * verify/verifyById share this: a denial (HTTP 403, { approved:false }) is a
   * domain outcome and is returned. Auth/validation/server errors throw.
   */
  private async doVerify(payload: unknown): Promise<VerifyResponse> {
    const { status, body } = await this.raw("/v1/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if ((status >= 200 && status < 300) || status === 403) return body as VerifyResponse;
    throw new VerifierError(`verify failed (HTTP ${status})`, { status, body });
  }

  /**
   * Verify a mandate and place a budget hold. Call this BEFORE processing payment.
   * A denied result is returned with `approved: false`; transport/auth/server
   * errors throw VerifierError.
   */
  async verify(
    mandate: IntentMandate | CartMandate,
    transaction: { amount: string; currency: string; items?: CartItem[]; idempotencyKey: string }
  ): Promise<VerifyResponse> {
    return this.doVerify({ mandate, transaction });
  }

  /**
   * Verify by mandate/policy ID — for integrations where the agent only passes
   * an ID (e.g. cart metadata), not the full mandate object.
   */
  async verifyById(mandateId: string, transaction: VerifyByIdTransaction): Promise<VerifyResponse> {
    return this.doVerify({ mandateId, transaction });
  }

  /**
   * Settle a verification after payment succeeds or fails.
   * success=true → budget permanently debited; success=false → hold released.
   */
  async settle(
    verificationId: string,
    paymentResult: { success: boolean; transactionId?: string; rail?: string }
  ): Promise<SettleResponse> {
    return this.post<SettleResponse>("/v1/settle", { verificationId, paymentResult });
  }

  /**
   * Release a pre-commit hold, returning the unspent reservation to the budget.
   * Use BEFORE a payment settles (planned charge cancelled, hold expiring).
   * For an already-settled payment, use refund() instead.
   */
  async release(verificationId: string): Promise<ReleaseResponse> {
    return this.post<ReleaseResponse>("/v1/release", { verificationId });
  }

  /**
   * Refund a settled (committed) payment, fully or partially. Restores budget.
   * `idempotencyKey` makes retries safe — the same key never double-refunds.
   * For a pre-commit hold that hasn't settled, use release() instead.
   */
  async refund(
    verificationId: string,
    amountCents: number,
    idempotencyKey: string
  ): Promise<RefundResponse> {
    return this.post<RefundResponse>("/v1/refund", {
      verificationId,
      amount_cents: amountCents,
      idempotency_key: idempotencyKey,
    });
  }

  /**
   * Create a spending budget — no crypto signatures needed. The API key holder
   * is the trust anchor. Returns a budget_id for use with verifyById().
   */
  async createBudget(options: {
    agentId: string;
    budgetTotal: number;
    currency?: string;
    validUntil: string;
    validFrom?: string;
    maxTransactions?: number;
    constraints?: {
      maxAmount?: string;
      currency?: string;
      allowedMerchants?: string[];
      blockedMerchants?: string[];
      categories?: string[];
    };
  }): Promise<{
    id: string;
    type: "budget";
    agentId: string;
    budgetTotal: string;
    remainingBudget: string;
    currency: string;
    validUntil: string;
  }> {
    return this.post("/v1/budgets", options);
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
    return this.get(`/v1/mandates/${encodeURIComponent(mandateId)}`);
  }
}
