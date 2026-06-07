/**
 * SD-JWT binding + disclosure hashes.
 *
 * Byte-exact port of AP2's `sdjwt/common.py` hashing: hash the ASCII bytes of
 * the on-wire string with the algorithm named by `_sd_alg` (default sha-256),
 * base64url (no padding). Used for `sd_hash` / `issuer_jwt_hash` chain binding
 * and disclosure digests. Tested against AP2-minted vectors.
 */

import { createHash } from "node:crypto";
import type { ParsedToken } from "./parse.js";

const HASH_BY_SD_ALG: Record<string, "sha256" | "sha384" | "sha512"> = {
  "sha-256": "sha256",
  "sha-384": "sha384",
  "sha-512": "sha512",
};

function hashForAlg(sdAlg: string | undefined): "sha256" | "sha384" | "sha512" {
  if (sdAlg === undefined) return "sha256";
  const alg = HASH_BY_SD_ALG[sdAlg];
  if (!alg) throw new Error(`Unsupported _sd_alg: ${sdAlg}`);
  return alg;
}

function hashAscii(value: string, sdAlg: string | undefined): string {
  return createHash(hashForAlg(sdAlg)).update(Buffer.from(value, "ascii")).digest("base64url");
}

/** Hash of the SD-JWT (issuer JWT + disclosures, trailing `~`, NO KB segment). */
export function computeSdHash(token: ParsedToken): string {
  return hashAscii(token.sdJwt, token.sdAlg);
}

/** Hash of only the issuer-signed JWT portion. */
export function computeIssuerJwtHash(token: ParsedToken): string {
  return hashAscii(token.issuerJwt, token.sdAlg);
}

/** Hash of a single disclosure string, using the token's `_sd_alg`. */
export function computeDisclosureDigest(disclosure: string, sdAlg: string | undefined): string {
  return hashAscii(disclosure, sdAlg);
}
