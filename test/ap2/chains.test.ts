import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parsePaymentChain,
  verifyPaymentChain,
  parseCheckoutChain,
  verifyCheckoutChain,
  receiptReference,
  getClosedMandateJwt,
} from "../../src/ap2/chains.js";

const here = dirname(fileURLToPath(import.meta.url));
const link = JSON.parse(readFileSync(join(here, "../fixtures/ap2-linkage-vectors.json"), "utf8")) as {
  checkoutChains: { name: string; open: unknown; closed: unknown; ap2Violations: string[]; tamperHash: boolean }[];
  receiptReferences: { name: string; chain: string; ap2Reference: string }[];
};

// ── Checkout chain: constraints match AP2; H6 self-compute is stricter ───────
for (const cc of link.checkoutChains) {
  test(`checkout chain vs AP2: ${cc.name}`, () => {
    const chain = parseCheckoutChain([cc.open, cc.closed]);
    const violations = verifyCheckoutChain(chain);
    if (cc.tamperHash) {
      // AP2 does NOT self-compute checkout_hash, so it accepts the tampered
      // mandate (0 violations). H6 catches it.
      assert.equal(cc.ap2Violations.length, 0, "AP2 accepts the tampered hash");
      assert.equal(violations.length, 1);
      assert.match(violations[0], /Self-computed checkout_hash mismatch/);
    } else {
      assert.deepEqual(violations, cc.ap2Violations, "constraint violations byte-exact vs AP2");
    }
  });
}

// ── Receipt reference = sd_hash of the final SD-JWT segment ───────────────────
for (const rr of link.receiptReferences) {
  test(`receipt reference vs AP2: ${rr.name}`, () => {
    assert.equal(receiptReference(rr.chain), rr.ap2Reference);
  });
}

// ── Payment chain linkage + arity ────────────────────────────────────────────
const PAYLOADS: unknown[] = [
  { vct: "mandate.payment.open.1", constraints: [], cnf: {} },
  {
    vct: "mandate.payment.1",
    transaction_id: "TX_ABC",
    payee: { id: "s-1", name: "Shop" },
    payment_amount: { amount: 1000, currency: "USD" },
    payment_instrument: { id: "pi-1", type: "credit" },
  },
];

test("payment chain: transaction_id linkage mismatch is a violation (H6)", () => {
  const chain = parsePaymentChain(PAYLOADS);
  assert.deepEqual(verifyPaymentChain(chain, { expectedTransactionId: "TX_ABC" }), []);
  const bad = verifyPaymentChain(chain, { expectedTransactionId: "TX_WRONG" });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /Payment transaction_id mismatch/);
});

test("typed chains require exactly 2 payloads", () => {
  assert.throws(() => parsePaymentChain([PAYLOADS[0]]), /exactly 2 payloads/);
  assert.throws(() => parseCheckoutChain([PAYLOADS[0], PAYLOADS[1], PAYLOADS[0]]), /exactly 2 payloads/);
});

test("getClosedMandateJwt returns the leaf issuer JWT of the final segment", () => {
  const rr = link.receiptReferences.find((r) => r.name === "valid_payment_2hop")!;
  const leaf = getClosedMandateJwt(rr.chain);
  assert.equal(leaf, rr.chain.split("~~").at(-1)!.split("~", 1)[0]);
  assert.equal(leaf.split(".").length, 3, "leaf is a compact JWT");
});
