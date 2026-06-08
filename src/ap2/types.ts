/**
 * Typed AP2 payment-mandate schemas (zod), mirroring AP2's generated models at
 * commit e1ea56d (`generated/open_payment_mandate.py`, `payment_mandate.py`,
 * `types/{amount,merchant,payment_instrument,pisp}.py`).
 *
 * `vct` is pinned to the EXACT version-suffixed literal (AUTH-1 / SPEC-16: a
 * verifier MUST match the full `vct` string), so a wrong/loose `vct` fails to
 * parse. Objects are non-strict (unknown keys stripped) to match pydantic's
 * default `extra='ignore'` and tolerate `iat`/`exp`/`risk_data`/future fields.
 * Constraints are kept loosely typed at the mandate level so an UNKNOWN
 * constraint type does not crash parsing — it is surfaced as a violation during
 * evaluation (AUTH-15: unknown constraints MUST fail evaluation), not silently
 * dropped.
 */

import { z } from "zod";

// ── Shared value types ───────────────────────────────────────────────────────
export const AmountSchema = z.object({ amount: z.number().int(), currency: z.string() });
export const MerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().nullish(),
});
export const PaymentInstrumentSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string().nullish(),
});
export const PispSchema = z.object({
  legal_name: z.string(),
  brand_name: z.string(),
  domain_name: z.string(),
});

export type Amount = z.infer<typeof AmountSchema>;
export type Merchant = z.infer<typeof MerchantSchema>;
export type PaymentInstrument = z.infer<typeof PaymentInstrumentSchema>;
export type Pisp = z.infer<typeof PispSchema>;

// ── Payment constraints (the `type` discriminators are AP2 wire literals) ─────
export const AmountRangeSchema = z.object({
  type: z.literal("payment.amount_range"),
  currency: z.string(),
  max: z.number().int(),
  min: z.number().int().nullish(),
});
export const BudgetSchema = z.object({
  type: z.literal("payment.budget"),
  max: z.number(), // MAJOR-unit float; evaluator converts to cents via trunc(max*100)
  currency: z.string(),
});
export const AgentRecurrenceSchema = z.object({
  type: z.literal("payment.agent_recurrence"),
  frequency: z.string(),
  max_occurrences: z.number().int().nullish(),
});
export const AllowedPayeesSchema = z.object({
  type: z.literal("payment.allowed_payees"),
  allowed: z.array(MerchantSchema),
});
export const AllowedPaymentInstrumentsSchema = z.object({
  type: z.literal("payment.allowed_payment_instruments"),
  allowed: z.array(PaymentInstrumentSchema),
});
export const AllowedPispsSchema = z.object({
  type: z.literal("payment.allowed_pisps"),
  allowed: z.array(PispSchema),
});
export const ExecutionDateSchema = z.object({
  type: z.literal("payment.execution_date"),
  not_before: z.string().nullish(),
  not_after: z.string().nullish(),
});
export const PaymentReferenceSchema = z.object({
  type: z.literal("payment.reference"),
  conditional_transaction_id: z.string(),
});

/** Strongly-typed union of the known payment constraints (for the evaluator). */
export const KnownPaymentConstraintSchema = z.discriminatedUnion("type", [
  AmountRangeSchema,
  BudgetSchema,
  AgentRecurrenceSchema,
  AllowedPayeesSchema,
  AllowedPaymentInstrumentsSchema,
  AllowedPispsSchema,
  ExecutionDateSchema,
  PaymentReferenceSchema,
]);
export type KnownPaymentConstraint = z.infer<typeof KnownPaymentConstraintSchema>;

/** A constraint as it appears in a mandate: at least a `type`, possibly unknown. */
const LooseConstraintSchema = z.object({ type: z.string() }).passthrough();

// ── Mandates ─────────────────────────────────────────────────────────────────
export const OpenPaymentMandateSchema = z.object({
  vct: z.literal("mandate.payment.open.1"),
  constraints: z.array(LooseConstraintSchema),
  cnf: z.unknown().optional(), // already validated during chain walk (jwk.ts/cnfJwk)
  payee: MerchantSchema.nullish(),
  payment_amount: AmountSchema.nullish(),
  payment_instrument: PaymentInstrumentSchema.nullish(),
  pisp: PispSchema.nullish(),
  execution_date: z.string().nullish(),
});
export const PaymentMandateSchema = z.object({
  vct: z.literal("mandate.payment.1"),
  transaction_id: z.string(),
  payee: MerchantSchema,
  pisp: PispSchema.nullish(),
  payment_amount: AmountSchema,
  payment_instrument: PaymentInstrumentSchema,
  execution_date: z.string().nullish(),
});

export type OpenPaymentMandate = z.infer<typeof OpenPaymentMandateSchema>;
export type PaymentMandate = z.infer<typeof PaymentMandateSchema>;

/** Aggregated usage context (port of `constraints.py::MandateContext`). */
export interface MandateContext {
  total_amount: number;
  total_uses: number;
  last_used_date?: number | null;
}

// ── Checkout mandate + constraints (mirror `generated/open_checkout_mandate.py`) ─
export const AllowedMerchantsSchema = z.object({
  type: z.literal("checkout.allowed_merchants"),
  allowed: z.array(MerchantSchema),
});
const LineItemRequirementsSchema = z.object({
  id: z.string(),
  acceptable_items: z.array(z.object({ id: z.string(), title: z.string() })),
  quantity: z.number().int().positive(),
});
export const LineItemsSchema = z.object({
  type: z.literal("checkout.line_items"),
  items: z.array(LineItemRequirementsSchema).min(1),
});
export const KnownCheckoutConstraintSchema = z.discriminatedUnion("type", [AllowedMerchantsSchema, LineItemsSchema]);
export type LineItemRequirement = z.infer<typeof LineItemRequirementsSchema>;

export const OpenCheckoutMandateSchema = z.object({
  vct: z.literal("mandate.checkout.open.1"),
  constraints: z.array(LooseConstraintSchema),
  cnf: z.unknown().optional(),
});
export type OpenCheckoutMandate = z.infer<typeof OpenCheckoutMandateSchema>;

/** Closed checkout mandate (mirror `generated/checkout_mandate.py`). */
export const CheckoutMandateSchema = z.object({
  vct: z.literal("mandate.checkout.1"),
  checkout_jwt: z.string(),
  checkout_hash: z.string(),
});
export type CheckoutMandate = z.infer<typeof CheckoutMandateSchema>;

/** Minimal UCP Checkout — only the fields the constraint evaluators read
 * (`merchant`, `line_items[].item.id`, `line_items[].quantity`). `extra='allow'`
 * in AP2, so unknown keys pass through. */
export const CheckoutSchema = z
  .object({
    merchant: MerchantSchema.nullish(),
    line_items: z
      .array(z.object({ item: z.object({ id: z.string() }).passthrough(), quantity: z.number().int() }).passthrough())
      .nullish(),
  })
  .passthrough();
export type Checkout = z.infer<typeof CheckoutSchema>;
