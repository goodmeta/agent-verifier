import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Buffer } from "node:buffer";
import { X509Certificate } from "node:crypto";
import type { JWK } from "jose";
import { splitChain } from "../../src/ap2/parse.js";
import { verifyChain } from "../../src/ap2/chain.js";
import { x5cOrKidProvider } from "../../src/ap2/keys.js";

const here = dirname(fileURLToPath(import.meta.url));
type Vector = {
  name: string;
  chain: string;
  kind?: string;
  rootKey?: JWK;
  x5cTrustedRoots?: string[];
  expectedAud: string;
  expectedNonce: string;
  expect: "valid" | "reject";
  hardening?: boolean;
  reason?: string;
  expectedPayloads?: Record<string, unknown>[];
};
const vectors = JSON.parse(readFileSync(join(here, "../fixtures/ap2-vectors.json"), "utf8")) as Vector[];
const get = (n: string): Vector => {
  const v = vectors.find((x) => x.name === n);
  if (!v) throw new Error(`vector ${n} not found`);
  return v;
};

// Fixed reference time so cert validity windows are reproducible (valid certs
// 2025–2030; the expired-leaf vector is 2020–2021).
const CURRENT = new Date("2026-06-01T00:00:00Z");
const trustedRoots = (v: Vector) => (v.x5cTrustedRoots ?? []).map((b) => new X509Certificate(Buffer.from(b, "base64url")));

// Pin which x5c check fires (hardenings are stricter than AP2, which accepts).
const X5C_REASON: Record<string, RegExp> = {
  x5c_untrusted_root: /does not chain to a trusted root/,
  x5c_fail_open: /refusing to fail open/,
  x5c_expired: /validity window/,
  x5c_non_ca_intermediate: /not a CA/,
  x5c_wrong_curve_leaf: /not an EC P-256/,
};

for (const v of vectors.filter((x) => x.kind === "x5c")) {
  if (v.expect === "valid") {
    test(`x5c valid: ${v.name} (leaf→intermediate→trusted root)`, async () => {
      const provider = x5cOrKidProvider({ trustedRoots: trustedRoots(v), currentTime: CURRENT });
      const payloads = await verifyChain(splitChain(v.chain), provider, {
        expectedAud: v.expectedAud,
        expectedNonce: v.expectedNonce,
      });
      assert.deepEqual(payloads, v.expectedPayloads);
    });
  } else {
    test(`x5c reject${v.hardening ? " (stricter than AP2, which accepts)" : ""}: ${v.name}`, async () => {
      const provider = x5cOrKidProvider({ trustedRoots: trustedRoots(v), currentTime: CURRENT });
      await assert.rejects(
        verifyChain(splitChain(v.chain), provider, { expectedAud: v.expectedAud, expectedNonce: v.expectedNonce }),
        X5C_REASON[v.name] ?? /.*/,
      );
    });
  }
}

// kid path (no x5c): provider resolves the root key by kid.
test("kid provider resolves the root key and verifies the chain", async () => {
  const v = get("valid_payment_2hop"); // root header kid = "user-1"
  const provider = x5cOrKidProvider({ kidLookup: (kid) => (kid === "user-1" ? (v.rootKey as JWK) : null) });
  const payloads = await verifyChain(splitChain(v.chain), provider, {
    expectedAud: v.expectedAud,
    expectedNonce: v.expectedNonce,
  });
  assert.deepEqual(payloads, v.expectedPayloads);
});

test("kid provider rejects an unknown kid (no fail-open)", async () => {
  const v = get("valid_payment_2hop");
  const provider = x5cOrKidProvider({ kidLookup: () => null });
  await assert.rejects(
    verifyChain(splitChain(v.chain), provider, { expectedAud: v.expectedAud, expectedNonce: v.expectedNonce }),
    /No key registered/,
  );
});
