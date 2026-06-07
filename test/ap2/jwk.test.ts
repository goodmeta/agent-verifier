import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseJwk } from "../../src/ap2/jwk.js";

const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(readFileSync(join(here, "../fixtures/ap2-vectors.json"), "utf8")) as Array<{ rootKey: unknown }>;

test("accepts a real AP2-minted EC P-256 JWK", () => {
  const jwk = parseJwk(vectors[0].rootKey);
  assert.ok(jwk, "real AP2 root key must validate");
  assert.equal(jwk!.kty, "EC");
  assert.equal(jwk!.crv, "P-256");
});

test("rejects wrong curve / kty, malformed x, and unknown members (strict, no smuggling)", () => {
  const base = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
  assert.ok(parseJwk(base), "base valid");
  assert.equal(parseJwk({ ...base, crv: "P-384" }), null, "wrong curve");
  assert.equal(parseJwk({ ...base, kty: "RSA" }), null, "wrong kty");
  assert.equal(parseJwk({ ...base, x: "tooshort" }), null, "bad x");
  assert.equal(parseJwk({ ...base, y: `${"b".repeat(42)}=` }), null, "padded/invalid y");
  assert.equal(parseJwk({ ...base, evil: "smuggled" }), null, "unknown member rejected");
  assert.equal(parseJwk(null), null, "null");
  assert.equal(parseJwk("not an object"), null, "string");
});
