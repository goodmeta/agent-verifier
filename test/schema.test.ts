import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents } from "../src/schema.js";

test("parseCents accepts positive integers (number + all-digit string)", () => {
  assert.equal(parseCents(2500), 2500);
  assert.equal(parseCents("2500"), 2500);
  assert.equal(parseCents(1), 1);
  assert.equal(parseCents(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
});

test("parseCents rejects zero/negative/fractional/NaN/Infinity/overflow numbers", () => {
  for (const bad of [0, -1, -500, 50.99, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseCents(bad), null, `parseCents(${String(bad)})`);
  }
});

test("parseCents rejects malformed strings", () => {
  for (const bad of ["", "0", "-500", "50.99", "0x10", "0b101", "1e3", " 10", "10 ", "abc", "3000abc", "9999999999999999", "+5", "1_000"]) {
    assert.equal(parseCents(bad), null, `parseCents(${JSON.stringify(bad)})`);
  }
});

test("parseCents rejects null/undefined/object/array/boolean/function", () => {
  for (const bad of [null, undefined, {}, [5], true, false, () => 5]) {
    assert.equal(parseCents(bad), null, `parseCents(${String(bad)})`);
  }
});
