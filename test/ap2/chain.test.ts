import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { JWK } from "jose";
import { splitChain } from "../../src/ap2/parse.js";
import { verifyChain } from "../../src/ap2/chain.js";

const here = dirname(fileURLToPath(import.meta.url));
type Vector = {
  name: string;
  chain: string;
  rootKey: JWK;
  expectedAud: string;
  expectedNonce: string;
  expect: "valid" | "reject";
  reason?: string;
  expectedPayloads?: Record<string, unknown>[];
};
const vectors = JSON.parse(readFileSync(join(here, "../fixtures/ap2-vectors.json"), "utf8")) as Vector[];
const get = (n: string): Vector => {
  const v = vectors.find((x) => x.name === n);
  if (!v) throw new Error(`vector ${n} not found`);
  return v;
};

// Valid chains: full walk must reproduce AP2's per-hop effective payloads.
for (const name of ["valid_payment_2hop", "valid_payment_3hop", "valid_payment_3hop_issuer_jwt_hash"]) {
  test(`verifyChain reproduces AP2's per-hop payloads: ${name}`, async () => {
    const v = get(name);
    const payloads = await verifyChain(splitChain(v.chain), v.rootKey, {
      expectedAud: v.expectedAud,
      expectedNonce: v.expectedNonce,
    });
    assert.deepEqual(payloads, v.expectedPayloads);
  });
}

// Every tampered/crafted vector (each confirmed rejected by AP2 at mint time).
for (const name of [
  "tampered_root_payload",
  "wrong_cnf_key",
  "binding_sd_hash_mismatch",
  "aud_mismatch",
  "nonce_mismatch",
  "wrong_root_key",
]) {
  test(`verifyChain rejects: ${name}`, async () => {
    const v = get(name);
    await assert.rejects(async () => {
      const tokens = splitChain(v.chain);
      await verifyChain(tokens, v.rootKey, { expectedAud: v.expectedAud, expectedNonce: v.expectedNonce });
    });
  });
}

test("H4: a KB-bearing chain fails closed when aud/nonce are absent", async () => {
  const v = get("valid_payment_2hop");
  await assert.rejects(verifyChain(splitChain(v.chain), v.rootKey, {}), /required/i);
});

test("H5: the chain-depth cap is enforced before any crypto", async () => {
  const v = get("valid_payment_2hop");
  const root = splitChain(v.chain)[0];
  const tooDeep = Array.from({ length: 9 }, () => root);
  await assert.rejects(verifyChain(tooDeep, v.rootKey, { expectedAud: "x", expectedNonce: "y" }), /too deep/i);
});
