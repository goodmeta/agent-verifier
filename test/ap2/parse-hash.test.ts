import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { splitChain, parseToken } from "../../src/ap2/parse.js";
import { computeSdHash, computeIssuerJwtHash, computeDisclosureDigest } from "../../src/ap2/hash.js";

const here = dirname(fileURLToPath(import.meta.url));
const pairs = JSON.parse(readFileSync(join(here, "../fixtures/ap2-hash-pairs.json"), "utf8")) as {
  rawSplitOnDoubleTilde: string[];
  segments: Array<{
    compact: string; issuerJwt: string; disclosures: string[]; kbJwt: string | null;
    sdAlg: string | null; sdJwt: string; canonical: string; sdHash: string;
    issuerJwtHash: string; disclosureDigests: Record<string, string>;
  }>;
};

test("splitChain reproduces AP2's per-segment canonicalization byte-exact", () => {
  const chain = pairs.rawSplitOnDoubleTilde.join("~~");
  const tokens = splitChain(chain);
  assert.equal(tokens.length, pairs.segments.length);
  pairs.segments.forEach((seg, i) => {
    assert.equal(tokens[i].issuerJwt, seg.issuerJwt, `seg${i} issuerJwt`);
    assert.deepEqual(tokens[i].disclosures, seg.disclosures, `seg${i} disclosures`);
    assert.equal(tokens[i].kbJwt, seg.kbJwt, `seg${i} kbJwt`);
    assert.equal(tokens[i].sdAlg ?? null, seg.sdAlg, `seg${i} sdAlg`);
    assert.equal(tokens[i].sdJwt, seg.sdJwt, `seg${i} sdJwt (canonical, byte-exact)`);
    assert.equal(tokens[i].canonical, seg.canonical, `seg${i} canonical`);
  });
});

test("hash.ts reproduces AP2's sd_hash / issuer_jwt_hash / disclosure digests byte-exact", () => {
  for (const seg of pairs.segments) {
    const t = parseToken(seg.compact);
    assert.equal(computeSdHash(t), seg.sdHash, "sdHash");
    assert.equal(computeIssuerJwtHash(t), seg.issuerJwtHash, "issuerJwtHash");
    for (const [disc, digest] of Object.entries(seg.disclosureDigests)) {
      assert.equal(computeDisclosureDigest(disc, t.sdAlg), digest, `disclosureDigest(${disc.slice(0, 8)}…)`);
    }
  }
});

test("parseToken rejects malformed tokens", () => {
  assert.throws(() => parseToken("~abc"), /empty issuer JWT/);
  assert.throws(() => parseToken("noseparator"), /missing disclosure separator/);
  assert.throws(() => parseToken("a.b.c~~d"), /empty disclosure segment/); // empty middle disclosure
  assert.throws(() => parseToken("a.b~"), /issuer JWT must have header\.payload\.signature/);
});
