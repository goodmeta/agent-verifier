import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyIntentSignature, checkConstraints, signIntentMandate } from "../src/index.js";
import type { IntentMandate } from "../src/index.js";

const ADDR = "0x0000000000000000000000000000000000000001";

function makeMandate(addr: string): IntentMandate {
  return {
    type: "intent-mandate",
    version: "0.1.0",
    id: "m-1",
    user: { id: addr },
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

test("verifies a valid EIP-712 intent signature (sign → verify round-trip)", async () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  const m = makeMandate(acct.address);
  m.userSignature = await signIntentMandate(m, acct);
  assert.equal((await verifyIntentSignature(m)).valid, true);
});

test("rejects a mandate with no signature", async () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  assert.equal((await verifyIntentSignature(makeMandate(acct.address))).valid, false);
});

test("rejects a tampered mandate (maxAmount changed after signing)", async () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  const m = makeMandate(acct.address);
  m.userSignature = await signIntentMandate(m, acct);
  m.constraints.maxAmount = "999999";
  assert.equal((await verifyIntentSignature(m)).valid, false);
});

test("rejects a signature from a different key than user.id", async () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  const m = makeMandate(other.address); // claims `other`
  m.userSignature = await signIntentMandate(m, acct); // but signed by `acct`
  assert.equal((await verifyIntentSignature(m)).valid, false);
});

test("checkConstraints approves an in-bounds transaction", () => {
  const r = checkConstraints(makeMandate(ADDR), {
    amount: "2200",
    merchantId: "m_ok",
    items: [{ id: "x", name: "Latte", quantity: 1, unitPrice: "2200", currency: "USDC", category: "coffee" }],
  });
  assert.equal(r.valid, true);
});

test("checkConstraints enforces max, allowlist, blocklist, category", () => {
  const m = makeMandate(ADDR);
  assert.equal(checkConstraints(m, { amount: "3500" }).valid, false); // over per-tx max
  assert.equal(checkConstraints(m, { amount: "1000", merchantId: "m_other" }).valid, false); // not allowed
  assert.equal(checkConstraints(m, { amount: "1000", merchantId: "m_bad" }).valid, false); // blocked
  assert.equal(
    checkConstraints(m, { amount: "1000", items: [{ id: "b", name: "Book", quantity: 1, unitPrice: "1000", currency: "USDC", category: "books" }] }).valid,
    false,
  ); // wrong category
});

test("checkConstraints denies expired and not-yet-valid mandates", () => {
  const exp = makeMandate(ADDR);
  exp.validUntil = new Date(Date.now() - 1000).toISOString();
  assert.equal(checkConstraints(exp, { amount: "100" }).valid, false);

  const nyv = makeMandate(ADDR);
  nyv.validFrom = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal(checkConstraints(nyv, { amount: "100" }).valid, false);
});

// Was the bug: parseInt("50.99") → 50 (silent truncation), parseInt("abc") → NaN (slipped through).
test("checkConstraints rejects fractional/negative/NaN/garbage amounts", () => {
  const m = makeMandate(ADDR);
  for (const bad of ["50.99", "-500", "abc", "3000abc"]) {
    assert.equal(checkConstraints(m, { amount: bad }).valid, false, `amount ${bad}`);
  }
});

// Was the bug: `new Date("garbage") > now` and `< now` are both false, so an
// unparseable validFrom/validUntil silently passed the temporal gate.
test("checkConstraints rejects unparseable validFrom/validUntil (no NaN fail-open)", () => {
  const okTx = {
    amount: "100",
    merchantId: "m_ok",
    items: [{ id: "x", name: "L", quantity: 1, unitPrice: "100", currency: "USDC", category: "coffee" }],
  };
  const badUntil = makeMandate(ADDR);
  badUntil.validUntil = "not-a-date";
  assert.equal(checkConstraints(badUntil, okTx).valid, false);
  const badFrom = makeMandate(ADDR);
  badFrom.validFrom = "garbage";
  assert.equal(checkConstraints(badFrom, okTx).valid, false);
});
