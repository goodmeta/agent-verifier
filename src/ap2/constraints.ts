/**
 * Payment-constraint evaluation — line-for-line port of AP2's
 * `sdk/constraints.py` (commit e1ea56d). Each evaluator returns a list of
 * violation messages ([] = satisfied). Violation strings match AP2's f-strings
 * byte-for-byte where the inputs are reproducible (amounts, ids, names, dates);
 * the few AP2 messages that embed a Python object `repr` (pisp / pre-set
 * amount+instrument) are noted and use a readable JSON form instead — only the
 * violation COUNT is asserted against AP2 for those.
 *
 * Closed-world rule (AUTH-15 / SPEC-39): an UNKNOWN constraint type MUST be
 * treated as failing evaluation.
 */

import {
  KnownPaymentConstraintSchema,
  KnownCheckoutConstraintSchema,
  type Amount,
  type Checkout,
  type Merchant,
  type MandateContext,
  type OpenCheckoutMandate,
  type OpenPaymentMandate,
  type PaymentMandate,
} from "./types.js";
import { evaluateLineItemsMaxFlow } from "./max-flow.js";

type Constraint = { type: string } & Record<string, unknown>;

interface EvalContext {
  openCheckoutHash?: string;
  mandateContext?: MandateContext;
  /**
   * Constraint types the caller requires to have been enforced on this mandate,
   * e.g. `["payment.budget"]`.
   *
   * AP2 builds one evaluator per constraint PRESENT in the open mandate and never
   * asserts which constraints ought to have been there, so a constraint withheld
   * through selective disclosure produces no evaluator and no violation. An empty
   * result therefore cannot distinguish "every constraint was evaluated and
   * satisfied" from "nothing was evaluated". Declaring the set here makes the
   * difference observable: a required constraint that is absent is reported
   * rather than silently skipped.
   *
   * Opt-in and additive. Omit it and evaluation is byte-identical to AP2.
   */
  requiredConstraints?: string[];
}

/** Port of `merchant_matches`: id-first, else name+website (both non-empty). */
export function merchantMatches(candidate: Merchant, target: Merchant): boolean {
  if (candidate.id && target.id) return candidate.id === target.id;
  return (
    candidate.name === target.name &&
    Boolean(candidate.name) &&
    candidate.website === target.website &&
    Boolean(candidate.website)
  );
}

function amountsEqual(a: Amount | null | undefined, b: Amount | null | undefined): boolean {
  return a?.amount === b?.amount && a?.currency === b?.currency;
}

/** Field-wise instrument equality with null/omitted normalized (matches AP2's
 * pydantic model equality, where `description: null` == omitted). */
function instrumentsEqual(
  a: { id: string; type: string; description?: string | null },
  b: { id: string; type: string; description?: string | null },
): boolean {
  return a.id === b.id && a.type === b.type && (a.description ?? null) === (b.description ?? null);
}

// ── Per-constraint evaluators (return violation messages) ────────────────────

function amountRange(c: { currency?: string; max?: number | null; min?: number | null }, closed: PaymentMandate): string[] {
  const v: string[] = [];
  const amount = closed.payment_amount;
  if (c.currency && amount.currency !== c.currency) {
    v.push(`Currency mismatch: expected ${c.currency}, got ${amount.currency}`);
  }
  if (c.min !== undefined && c.min !== null && amount.amount < c.min) {
    v.push(`Amount ${amount.amount} below minimum ${c.min}`);
  }
  if (c.max !== undefined && c.max !== null && amount.amount > c.max) {
    v.push(`Amount ${amount.amount} exceeds maximum ${c.max}`);
  }
  return v;
}

function allowedPayees(c: { allowed: Merchant[] }, closed: PaymentMandate): string[] {
  const payee = closed.payee;
  if (c.allowed.some((a) => merchantMatches(a, payee))) return [];
  return [`Payee ${payee.name} not in allowed list`];
}

function paymentReference(c: { conditional_transaction_id: string }, ctx: EvalContext): string[] {
  if (!ctx.openCheckoutHash) {
    return ["open_checkout_hash is required to evaluate PaymentReference constraints"];
  }
  if (ctx.openCheckoutHash !== c.conditional_transaction_id) {
    return [
      `PaymentReference mismatch: expected open checkout hash ${c.conditional_transaction_id}, got ${ctx.openCheckoutHash}`,
    ];
  }
  return [];
}

function agentRecurrence(c: { max_occurrences?: number | null }, ctx: EvalContext): string[] {
  const limit = c.max_occurrences;
  if (limit === undefined || limit === null) return [];
  if (!ctx.mandateContext) return ["Missing mandate context required to evaluate recurrence"];
  const count = ctx.mandateContext.total_uses;
  if (count >= limit) return [`Maximum occurrences exceeded: ${count} >= ${limit}`];
  return [];
}

function allowedPaymentInstruments(c: { allowed: { id: string }[] }, closed: PaymentMandate): string[] {
  const instrument = closed.payment_instrument;
  if (!instrument) return ["Missing payment instrument in closed mandate"];
  if (c.allowed.some((a) => a.id === instrument.id)) return [];
  return [`Payment instrument ${instrument.id} not in allowed list`];
}

function allowedPisps(c: { allowed: { legal_name: string; brand_name: string; domain_name: string }[] }, closed: PaymentMandate): string[] {
  const pisp = closed.pisp;
  if (!pisp) return ["Missing PISP in closed mandate"];
  if (c.allowed.some((a) => a.domain_name === pisp.domain_name && a.legal_name === pisp.legal_name && a.brand_name === pisp.brand_name)) {
    return [];
  }
  // AP2 embeds a Python repr here; we use a readable form (count is what's asserted).
  return [`PISP ${JSON.stringify(pisp)} not in allowed list`];
}

function budget(c: { max: number; currency: string }, closed: PaymentMandate, ctx: EvalContext): string[] {
  if (closed.payment_amount.currency !== c.currency) {
    return [`Budget currency mismatch: expected ${c.currency}, got ${closed.payment_amount.currency}`];
  }
  if (!ctx.mandateContext) return ["Missing mandate context required to evaluate budget"];
  const pastSpend = ctx.mandateContext.total_amount;
  const totalSpend = pastSpend + closed.payment_amount.amount;
  const budgetMaxCents = Math.trunc(c.max * 100);
  if (totalSpend > budgetMaxCents) {
    return [`Cumulative spend ${totalSpend} exceeds budget limit ${budgetMaxCents} (past spend: ${pastSpend})`];
  }
  return [];
}

function executionDate(c: { not_before?: string | null; not_after?: string | null }, closed: PaymentMandate): string[] {
  const execDate = closed.execution_date;
  if (!execDate) return [];
  const v: string[] = [];
  if (c.not_before && execDate < c.not_before) {
    v.push(`Execution date ${execDate} is before allowed window ${c.not_before}`);
  }
  if (c.not_after && execDate > c.not_after) {
    v.push(`Execution date ${execDate} is after allowed window ${c.not_after}`);
  }
  return v;
}

/** Dispatch one constraint; UNKNOWN type ⇒ a violation (closed-world, AUTH-15). */
function evaluatePaymentConstraint(raw: Constraint, closed: PaymentMandate, ctx: EvalContext): string[] {
  const parsed = KnownPaymentConstraintSchema.safeParse(raw);
  if (!parsed.success) {
    return [`Unknown or malformed constraint type '${raw.type}' — treated as failing evaluation`];
  }
  const c = parsed.data;
  switch (c.type) {
    case "payment.amount_range":
      return amountRange(c, closed);
    case "payment.allowed_payees":
      return allowedPayees(c, closed);
    case "payment.reference":
      return paymentReference(c, ctx);
    case "payment.agent_recurrence":
      return agentRecurrence(c, ctx);
    case "payment.allowed_payment_instruments":
      return allowedPaymentInstruments(c, closed);
    case "payment.allowed_pisps":
      return allowedPisps(c, closed);
    case "payment.budget":
      return budget(c, closed, ctx);
    case "payment.execution_date":
      return executionDate(c, closed);
  }
}

/** Port of `check_preset_payment_claims`: open mandate pre-set fields must be
 * present unchanged in the closed mandate (SPEC-38 / step 2). */
export function checkPresetPaymentClaims(open: OpenPaymentMandate, closed: PaymentMandate): string[] {
  const v: string[] = [];
  if (open.payee != null && !merchantMatches(open.payee, closed.payee)) {
    v.push(`Pre-set payee mismatch: expected ${open.payee.name}, got ${closed.payee.name}`);
  }
  if (open.payment_amount != null && !amountsEqual(open.payment_amount, closed.payment_amount)) {
    v.push("Pre-set amount mismatch"); // AP2 embeds a Python repr; count is asserted
  }
  if (open.payment_instrument != null && !instrumentsEqual(open.payment_instrument, closed.payment_instrument)) {
    v.push("Pre-set payment_instrument mismatch");
  }
  if (open.execution_date != null && open.execution_date !== closed.execution_date) {
    v.push(`Pre-set execution_date mismatch: expected ${open.execution_date}, got ${closed.execution_date}`);
  }
  return v;
}

/**
 * Verify a closed payment satisfies an open mandate's pre-set claims and
 * constraints. Port of `check_payment_constraints`. Returns [] when satisfied.
 */
export function checkPaymentConstraints(open: OpenPaymentMandate, closed: PaymentMandate, ctx: EvalContext = {}): string[] {
  const violations: string[] = [];
  violations.push(...checkPresetPaymentClaims(open, closed));

  const types = open.constraints.map((c) => c.type);
  if (types.includes("payment.agent_recurrence")) {
    if (!types.includes("payment.amount_range")) {
      violations.push("payment.agent_recurrence requires payment.amount_range constraint");
    }
    if (!types.includes("payment.budget")) {
      violations.push("payment.agent_recurrence requires payment.budget constraint");
    }
  }

  // Caller-declared coverage. Same shape as the agent_recurrence check above,
  // generalised: a constraint the caller requires but which is not present was
  // never evaluated, so reporting no violation for it would certify a limit that
  // was never applied. Only runs when the caller opts in.
  for (const required of ctx.requiredConstraints ?? []) {
    if (!types.includes(required)) {
      violations.push(
        `${required} was required but is not present in the open mandate, so it was never evaluated`,
      );
    }
  }

  for (const c of open.constraints) {
    violations.push(...evaluatePaymentConstraint(c as Constraint, closed, ctx));
  }
  return violations;
}

// ── Checkout constraints (port of the checkout half of constraints.py) ───────

function allowedMerchants(c: { allowed: Merchant[] }, checkout: Checkout): string[] {
  const merchant = checkout.merchant;
  if (!merchant) return ["Missing merchant in checkout"];
  if (c.allowed.some((a) => merchantMatches(a, merchant))) return [];
  return [`Merchant ${merchant.name || ""} not in allowed list`];
}

function lineItems(c: { items: { acceptable_items: { id: string }[]; quantity: number }[] }, checkout: Checkout): string[] {
  const checkoutItems = checkout.line_items ?? [];
  if (checkoutItems.length === 0) return ["Empty cart does not satisfy line_items constraint"];
  return evaluateLineItemsMaxFlow(checkoutItems, c.items);
}

function evaluateCheckoutConstraint(raw: Constraint, checkout: Checkout): string[] {
  const parsed = KnownCheckoutConstraintSchema.safeParse(raw);
  if (!parsed.success) {
    return [`Unknown or malformed constraint type '${raw.type}' — treated as failing evaluation`];
  }
  const c = parsed.data;
  switch (c.type) {
    case "checkout.allowed_merchants":
      return allowedMerchants(c, checkout);
    case "checkout.line_items":
      return lineItems(c, checkout);
  }
}

/** Verify a checkout satisfies an open checkout mandate's constraints. Port of
 * `check_checkout_constraints`. Returns [] when satisfied. */
export function checkCheckoutConstraints(open: OpenCheckoutMandate, checkout: Checkout): string[] {
  const violations: string[] = [];
  for (const c of open.constraints) {
    violations.push(...evaluateCheckoutConstraint(c as Constraint, checkout));
  }
  return violations;
}
