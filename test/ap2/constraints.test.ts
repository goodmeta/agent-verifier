import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OpenPaymentMandateSchema, PaymentMandateSchema } from "../../src/ap2/types.js";
import { checkPaymentConstraints } from "../../src/ap2/constraints.js";

const here = dirname(fileURLToPath(import.meta.url));
type CV = {
  name: string;
  open: unknown;
  closed: unknown;
  openCheckoutHash: string | null;
  context: { total_amount: number; total_uses: number } | null;
  ap2Violations: string[];
  valid: boolean;
};
const vectors = JSON.parse(readFileSync(join(here, "../fixtures/ap2-constraint-vectors.json"), "utf8")) as CV[];

// AP2 embeds a Python object repr in these two messages, so we match the
// violation COUNT (not the exact bytes); every other message is byte-exact.
const REPR_ONLY = new Set(["allowed_pisps_fail", "preset_amount_mismatch"]);

for (const v of vectors) {
  test(`payment constraints vs AP2: ${v.name}`, () => {
    const open = OpenPaymentMandateSchema.parse(v.open);
    const closed = PaymentMandateSchema.parse(v.closed);
    const violations = checkPaymentConstraints(open, closed, {
      openCheckoutHash: v.openCheckoutHash ?? undefined,
      mandateContext: v.context
        ? { total_amount: v.context.total_amount, total_uses: v.context.total_uses }
        : undefined,
    });
    assert.equal(violations.length === 0, v.valid, "valid parity");
    if (REPR_ONLY.has(v.name)) {
      assert.equal(violations.length, v.ap2Violations.length, "violation count parity");
    } else {
      assert.deepEqual(violations, v.ap2Violations, "violation messages byte-exact vs AP2");
    }
  });
}

// Unknown constraint type: AP2 rejects it at parse (pydantic discriminated
// union); we reject at evaluation (closed-world, AUTH-15). Both fail closed.
test("unknown constraint type fails evaluation (AUTH-15)", () => {
  const open = OpenPaymentMandateSchema.parse({
    vct: "mandate.payment.open.1",
    constraints: [{ type: "payment.totally_unknown", foo: 1 }],
    cnf: {},
  });
  const closed = PaymentMandateSchema.parse({
    vct: "mandate.payment.1",
    transaction_id: "tx_1",
    payee: { id: "s-1", name: "Shop" },
    payment_amount: { amount: 1000, currency: "USD" },
    payment_instrument: { id: "pi-1", type: "credit" },
  });
  const violations = checkPaymentConstraints(open, closed);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Unknown or malformed constraint/);
});

// vct exact-match incl. version suffix (L2-3 / AUTH-1 / SPEC-16).
test("a wrong vct version suffix is rejected (exact match)", () => {
  assert.throws(() => OpenPaymentMandateSchema.parse({ vct: "mandate.payment.open.2", constraints: [], cnf: {} }));
  assert.throws(() =>
    PaymentMandateSchema.parse({
      vct: "mandate.payment.2",
      transaction_id: "t",
      payee: { id: "s", name: "S" },
      payment_amount: { amount: 1, currency: "USD" },
      payment_instrument: { id: "p", type: "c" },
    }),
  );
});
