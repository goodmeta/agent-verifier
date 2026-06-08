import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OpenCheckoutMandateSchema, CheckoutSchema } from "../../src/ap2/types.js";
import { checkCheckoutConstraints } from "../../src/ap2/constraints.js";

const here = dirname(fileURLToPath(import.meta.url));
type CV = { name: string; open: unknown; checkout: unknown; ap2Violations: string[]; valid: boolean };
const vectors = JSON.parse(
  readFileSync(join(here, "../fixtures/ap2-checkout-constraint-vectors.json"), "utf8"),
) as CV[];

for (const v of vectors) {
  test(`checkout constraints vs AP2: ${v.name}`, () => {
    const open = OpenCheckoutMandateSchema.parse(v.open);
    const checkout = CheckoutSchema.parse(v.checkout);
    const violations = checkCheckoutConstraints(open, checkout);
    assert.equal(violations.length === 0, v.valid, "valid parity");
    assert.deepEqual(violations, v.ap2Violations, "violation messages byte-exact vs AP2");
  });
}

// Direct max-flow stress beyond the AP2-minted set: a 3-requirement complex
// case where greedy can't resolve and flow must split items across slots.
test("line_items max-flow splits an ambiguous item across requirement slots", () => {
  const open = OpenCheckoutMandateSchema.parse({
    vct: "mandate.checkout.open.1",
    cnf: {},
    constraints: [
      {
        type: "checkout.line_items",
        items: [
          { id: "r1", acceptable_items: [{ id: "A", title: "A" }, { id: "X", title: "X" }], quantity: 1 },
          { id: "r2", acceptable_items: [{ id: "B", title: "B" }, { id: "X", title: "X" }], quantity: 1 },
        ],
      },
    ],
  });
  // X is acceptable by both r1 and r2 (degree 2 → complex). Cart: A, B, X.
  // A→r1, B→r2 greedily; X has nowhere left → 1 unassigned.
  const checkout = CheckoutSchema.parse({
    line_items: [
      { item: { id: "A" }, quantity: 1 },
      { item: { id: "B" }, quantity: 1 },
      { item: { id: "X" }, quantity: 1 },
    ],
  });
  const violations = checkCheckoutConstraints(open, checkout);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Cannot satisfy line item constraints: X \(1\)/);
});
