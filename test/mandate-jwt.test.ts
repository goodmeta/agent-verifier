import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK } from "jose";
import { signMandate, verifyMandate } from "../src/mandate-jwt.js";

async function keys() {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  return { priv: await exportJWK(privateKey), pub: await exportJWK(publicKey) };
}

test("ES256 round-trip: sign whole mandate, verify, parse back", async () => {
  const { priv, pub } = await keys();
  const mandate = {
    id: "m1",
    constraints: { maxAmount: "3000", allowedMerchants: ["m_ok"], categories: ["coffee"] },
    validFrom: "2020-01-01T00:00:00Z",
    validUntil: "2030-01-01T00:00:00Z",
  };
  const token = await signMandate(mandate, priv);
  const r = await verifyMandate(token, pub);
  assert.equal(r.valid, true);
  assert.deepEqual(r.mandate, mandate);
});

// The whole point of CRIT-1: every field is under the signature.
test("rejects a tampered token (any payload change breaks the signature)", async () => {
  const { priv, pub } = await keys();
  const token = await signMandate({ id: "m1", constraints: { allowedMerchants: ["m_ok"] } }, priv);
  const [h, p, s] = token.split(".");
  const flipped = p.slice(0, -2) + (p.slice(-2) === "AA" ? "BB" : "AA");
  const r = await verifyMandate([h, flipped, s].join("."), pub);
  assert.equal(r.valid, false);
});

test("rejects verification with the wrong public key", async () => {
  const a = await keys();
  const b = await keys();
  const token = await signMandate({ id: "m1" }, a.priv);
  const r = await verifyMandate(token, b.pub);
  assert.equal(r.valid, false);
});

test("rejects a malformed token", async () => {
  const { pub } = await keys();
  const r = await verifyMandate("not.a.jwt", pub);
  assert.equal(r.valid, false);
});
