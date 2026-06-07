import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { JWK } from "jose";
import { splitChain } from "../../src/ap2/parse.js";
import { computeDisclosureDigest } from "../../src/ap2/hash.js";
import {
  verifyRootSdJwt,
  resolveDisclosures,
  resolveDelegatePayload,
} from "../../src/ap2/sd-jwt.js";

const here = dirname(fileURLToPath(import.meta.url));
type Vector = {
  name: string;
  chain: string;
  rootKey: JWK;
  expect: "valid" | "reject";
  expectedPayloads?: Record<string, unknown>[];
};
const vectors = JSON.parse(readFileSync(join(here, "../fixtures/ap2-vectors.json"), "utf8")) as Vector[];
const byName = (n: string): Vector => {
  const v = vectors.find((x) => x.name === n);
  if (!v) throw new Error(`vector ${n} not found`);
  return v;
};

test("root verify of valid_payment_2hop yields AP2's expectedPayloads[0] byte-exact", async () => {
  const v = byName("valid_payment_2hop");
  const root = splitChain(v.chain)[0];
  const { delegateItems } = await verifyRootSdJwt(root, v.rootKey);
  assert.equal(delegateItems.length, 1, "root resolves exactly one delegate item");
  assert.deepEqual(delegateItems[0], v.expectedPayloads![0]);
});

test("a tampered root payload is rejected (corrupted bytes fail parse-or-verify)", async () => {
  // The byte flip corrupts the payload's JSON, so this vector is rejected at
  // parse time — an even earlier failure than the signature check. Either way
  // the forged token never verifies. (Pure signature rejection: wrong_root_key.)
  const v = byName("tampered_root_payload");
  await assert.rejects(async () => {
    const root = splitChain(v.chain)[0];
    await verifyRootSdJwt(root, v.rootKey);
  });
});

test("root verify rejects a valid, well-formed chain under the wrong root key (signature)", async () => {
  const v = byName("wrong_root_key");
  const root = splitChain(v.chain)[0]; // parses fine — valid JSON, valid structure
  await assert.rejects(verifyRootSdJwt(root, v.rootKey), /signature/i);
});

test("CMWallet quirk: a bare digest string in delegate_payload resolves to the disclosed dict", () => {
  // Port of kb_sd_jwt.py::_resolve_delegate_payload, exercised with AP2's real
  // disclosure bytes: the digest-string form must resolve to the same dict the
  // standard {"...": digest} array-element form does (== expectedPayloads[0]).
  const v = byName("valid_payment_2hop");
  const root = splitChain(v.chain)[0];
  const digest = computeDisclosureDigest(root.disclosures[0], root.sdAlg);
  const payload = { delegate_payload: [digest] } as Record<string, unknown>;
  resolveDelegatePayload(payload, root);
  assert.deepEqual((payload.delegate_payload as unknown[])[0], v.expectedPayloads![0]);
});

test("CMWallet quirk: an unmatched digest string is left untouched", () => {
  const v = byName("valid_payment_2hop");
  const root = splitChain(v.chain)[0];
  const payload = { delegate_payload: ["not-a-real-digest"] } as Record<string, unknown>;
  resolveDelegatePayload(payload, root);
  assert.deepEqual(payload.delegate_payload, ["not-a-real-digest"]);
});

test("resolveDisclosures rejects a non-sha-256 _sd_alg", () => {
  assert.throws(() => resolveDisclosures({}, [], "sha-512"), /Invalid hash algorithm/);
});

test("resolveDisclosures rejects duplicate disclosure hashes", () => {
  const v = byName("valid_payment_2hop");
  const d = splitChain(v.chain)[0].disclosures[0];
  assert.throws(() => resolveDisclosures({ _sd: [] }, [d, d], "sha-256"), /Duplicate disclosure hash/);
});
