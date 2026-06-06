/**
 * Input validation schemas (zod).
 *
 * The untrusted boundary is the runtime spend request — what an agent wants to
 * spend right now. Mandate *integrity* is guaranteed separately by the EIP-712
 * signature (see verify.ts), so here we validate the request shapes and, above
 * all, the money field.
 *
 * `Cents` is the shared money validator: a positive, safe-integer cent value,
 * accepted as a number or an all-digit string. It rejects fractional, negative,
 * zero, NaN, Infinity, overflow, and any non-digit string — the same rule the
 * hosted Verifier enforces, so self-hosted and hosted agree to the cent.
 */
import { z } from "zod";

export const Cents = z
  .union([z.number(), z.string().regex(/^\d+$/, "must be all digits")])
  .transform((v) => (typeof v === "string" ? Number(v) : v))
  .refine((n) => Number.isSafeInteger(n) && n > 0, {
    message: "amount must be a positive integer (cents)",
  });

/** Parse any input into positive cents, or return null (never throws). */
export function parseCents(input: unknown): number | null {
  const r = Cents.safeParse(input);
  return r.success ? r.data : null;
}

const CartItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.string(),
  currency: z.string(),
  category: z.string().optional(),
});

/** A constraint-check transaction — the input to `checkConstraints`. */
export const ConstraintTxSchema = z.object({
  amount: Cents,
  merchantId: z.string().optional(),
  items: z.array(CartItemSchema).optional(),
});

/** A policy spend request — the input to `checkPolicy`. */
export const PolicyRequestSchema = z.object({
  agentId: z.string(),
  amount: Cents,
  metadata: z
    .object({ code: z.string().optional(), customer: z.string().optional() })
    .passthrough()
    .optional(),
  idempotencyKey: z.string(),
});
