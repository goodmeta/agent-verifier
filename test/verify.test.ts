import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConstraints } from "../src/index.js";
import type { IntentMandate } from "../src/index.js";

function makeMandate(): IntentMandate {
  return {
    type: "intent-mandate",
    version: "0.1.0",
    id: "m-1",
    user: { id: "user-1" },
    agent: { id: "agent-1" },
    intent: "buy coffee",
    constraints: {
      maxAmount: "3000",
      currency: "USDC",
      categories: ["coffee"],
      allowedMerchants: ["m_ok"],
      blockedMerchants: ["m_bad"],
    },
    validFrom: new Date(Date.now() - 1000).toISOString(),
    validUntil: new Date(Date.now() + 3_600_000).toISOString(),
    budgetTotal: "10000",
    budgetSpent: "0",
  };
}
const coffee = [{ id: "x", name: "Latte", quantity: 1, unitPrice: "2200", currency: "USDC", category: "coffee" }];

test("approves an in-bounds transaction", () => {
  assert.equal(checkConstraints(makeMandate(), { amount: "2200", merchantId: "m_ok", items: coffee }).valid, true);
});

test("denies over per-transaction max", () => {
  assert.equal(checkConstraints(makeMandate(), { amount: "3500", merchantId: "m_ok", items: coffee }).valid, false);
});

test("allowlist denies a non-listed merchant AND a missing merchantId (no fail-open)", () => {
  const m = makeMandate();
  assert.equal(checkConstraints(m, { amount: "1000", merchantId: "m_other", items: coffee }).valid, false);
  assert.equal(checkConstraints(m, { amount: "1000", items: coffee }).valid, false); // missing merchantId
});

test("blocklist denies (mandate without an allowlist)", () => {
  const m = makeMandate();
  m.constraints.allowedMerchants = undefined;
  assert.equal(checkConstraints(m, { amount: "1000", merchantId: "m_bad", items: coffee }).valid, false);
});

test("category denies a disallowed category AND a no-items tx (no fail-open)", () => {
  const m = makeMandate();
  assert.equal(
    checkConstraints(m, { amount: "1000", merchantId: "m_ok", items: [{ id: "b", name: "Book", quantity: 1, unitPrice: "1000", currency: "USDC", category: "books" }] }).valid,
    false,
  );
  assert.equal(checkConstraints(m, { amount: "1000", merchantId: "m_ok" }).valid, false); // no items
});

test("denies expired and not-yet-valid mandates", () => {
  const exp = makeMandate();
  exp.validUntil = new Date(Date.now() - 1000).toISOString();
  assert.equal(checkConstraints(exp, { amount: "100", merchantId: "m_ok", items: coffee }).valid, false);
  const nyv = makeMandate();
  nyv.validFrom = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal(checkConstraints(nyv, { amount: "100", merchantId: "m_ok", items: coffee }).valid, false);
});

test("rejects unparseable validFrom/validUntil (no NaN fail-open)", () => {
  const okTx = { amount: "100", merchantId: "m_ok", items: coffee };
  const bu = makeMandate();
  bu.validUntil = "not-a-date";
  assert.equal(checkConstraints(bu, okTx).valid, false);
  const bf = makeMandate();
  bf.validFrom = "garbage";
  assert.equal(checkConstraints(bf, okTx).valid, false);
});

test("rejects fractional/negative/NaN/garbage amounts", () => {
  const m = makeMandate();
  for (const bad of ["50.99", "-500", "abc", "3000abc"]) {
    assert.equal(checkConstraints(m, { amount: bad, merchantId: "m_ok", items: coffee }).valid, false, `amount ${bad}`);
  }
});
