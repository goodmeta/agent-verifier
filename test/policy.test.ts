import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPolicy, type SpendingPolicy } from "../src/policy.js";

const policy: SpendingPolicy = {
  agentId: "billing-agent",
  budgetTotal: 20_000,
  budgetPeriod: "monthly",
  constraints: { maxPerEvent: 5_000, allowedCodes: ["api_calls", "compute"], blockedCustomers: ["acme"] },
};
const req = (amount: unknown, extra: Record<string, unknown> = {}) =>
  ({ agentId: "billing-agent", amount, idempotencyKey: "k", ...extra }) as never;

test("approves a valid in-budget request and reports remaining", () => {
  const r = checkPolicy(policy, req(4_500));
  assert.equal(r.approved, true);
  assert.deepEqual(r.remaining, { budget: 15_500, period: "monthly" });
});

test("denies over per-event max", () => {
  const r = checkPolicy(policy, req(6_000));
  assert.equal(r.approved, false);
  assert.equal(r.reason, "AMOUNT_EXCEEDED");
});

test("denies when amount exceeds remaining budget (currentSpend applied)", () => {
  const r = checkPolicy(policy, req(3_000), 18_000);
  assert.equal(r.approved, false);
  assert.equal(r.reason, "BUDGET_EXCEEDED");
});

test("denies a code not in the allowlist", () => {
  const r = checkPolicy(policy, req(1_000, { metadata: { code: "storage" } }));
  assert.equal(r.approved, false);
  assert.equal(r.reason, "CODE_NOT_ALLOWED");
});

test("denies a blocked customer", () => {
  const r = checkPolicy(policy, req(1_000, { metadata: { customer: "acme" } }));
  assert.equal(r.approved, false);
  assert.equal(r.reason, "CUSTOMER_BLOCKED");
});

// The bug: a negative amount used to be approved AND inflate the budget.
test("rejects a negative amount (was approved + budget-inflating)", () => {
  const r = checkPolicy(policy, req(-5_000));
  assert.equal(r.approved, false);
  assert.equal(r.reason, "INVALID_AMOUNT");
});

test("rejects fractional / NaN / Infinity amounts", () => {
  assert.equal(checkPolicy(policy, req(50.5)).reason, "INVALID_AMOUNT");
  assert.equal(checkPolicy(policy, req(NaN)).reason, "INVALID_AMOUNT");
  assert.equal(checkPolicy(policy, req(Infinity)).reason, "INVALID_AMOUNT");
});

test("rejects a malformed request shape (missing agentId)", () => {
  const r = checkPolicy(policy, { amount: 1_000, idempotencyKey: "k" } as never);
  assert.equal(r.approved, false);
  assert.equal(r.reason, "INVALID_REQUEST");
});
