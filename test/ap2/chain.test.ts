import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { JWK } from "jose";
import { splitChain } from "../../src/ap2/parse.js";
import { verifyChain } from "../../src/ap2/chain.js";
import { cnfJwk, type ResolvedToken } from "../../src/ap2/sd-jwt.js";

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
// The regex pins WHICH check fires, so a vector can't silently start rejecting
// for the wrong reason. Permissive (/./) where parse-or-signature is acceptable.
const REJECTS: Record<string, RegExp> = {
  tampered_root_payload: /parse|signature/i,
  wrong_cnf_key: /signature/i,
  binding_sd_hash_mismatch: /sd_hash mismatch/,
  aud_mismatch: /aud mismatch/,
  nonce_mismatch: /nonce mismatch/,
  wrong_root_key: /signature/i,
  // P3 hand-built negatives (PLAN §7) — each AP2-confirmed at mint time.
  wrong_typ: /Unexpected JWT typ/,
  both_binding_claims: /exactly one of 'sd_hash'/,
  neither_binding_claim: /exactly one of 'sd_hash'/,
  terminal_with_cnf: /Terminal KB-SD-JWT MUST NOT carry/,
  intermediate_without_cnf: /Intermediate .* requires a 'cnf'/,
  expired: /expired/,
  alg_swap_none_root: /alg.*not allowed/i,
  alg_swap_hs256_hop: /alg.*not allowed/i,
};
for (const [name, reason] of Object.entries(REJECTS)) {
  test(`verifyChain rejects (right reason): ${name}`, async () => {
    const v = get(name);
    await assert.rejects(async () => {
      const tokens = splitChain(v.chain);
      await verifyChain(tokens, v.rootKey, { expectedAud: v.expectedAud, expectedNonce: v.expectedNonce });
    }, reason);
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

// H3 is STRICTER than AP2 (AP2 first-matches; we reject ambiguity), so there is
// no AP2-confirmed reject vector — assert the guard directly on cnfJwk.
test("H3: cnfJwk rejects an ambiguous cnf (more than one delegate item carries cnf)", () => {
  const token = splitChain(get("valid_payment_2hop").chain)[0];
  const jwk = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
  const resolved: ResolvedToken = {
    token,
    verifiedPayload: {},
    delegateItems: [
      { vct: "mandate.payment.open.1", cnf: { jwk } },
      { vct: "mandate.payment.open.1", cnf: { jwk } },
    ],
  };
  assert.throws(() => cnfJwk(resolved), /ambiguous/i);
});
