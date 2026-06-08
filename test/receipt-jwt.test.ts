import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK } from "jose";
import { signReceipt, verifyReceipt } from "../src/receipt-jwt.js";

async function keys() {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  return { priv: await exportJWK(privateKey), pub: await exportJWK(publicKey) };
}

test("ES256 round-trip: sign whole receipt, verify, parse back", async () => {
  const { priv, pub } = await keys();
  const receipt = {
    iss: "https://verifier.example",
    result: "success",
    reference: "abc123",
    iat: 1780000000,
  };
  const token = await signReceipt(receipt, priv);
  const r = await verifyReceipt(token, pub);
  assert.equal(r.valid, true);
  assert.deepEqual(r.payload, receipt);
});

// Every field is under the signature — no signed-subset vs enforced-superset gap.
test("rejects a tampered token (any payload change breaks the signature)", async () => {
  const { priv, pub } = await keys();
  const token = await signReceipt({ iss: "v", result: "success", reference: "r" }, priv);
  const [h, p, s] = token.split(".");
  const flipped = p.slice(0, -2) + (p.slice(-2) === "AA" ? "BB" : "AA");
  const r = await verifyReceipt([h, flipped, s].join("."), pub);
  assert.equal(r.valid, false);
});

test("rejects verification with the wrong public key", async () => {
  const a = await keys();
  const b = await keys();
  const token = await signReceipt({ reference: "r1" }, a.priv);
  const r = await verifyReceipt(token, b.pub);
  assert.equal(r.valid, false);
});

test("rejects a malformed token", async () => {
  const { pub } = await keys();
  const r = await verifyReceipt("not.a.jwt", pub);
  assert.equal(r.valid, false);
});
