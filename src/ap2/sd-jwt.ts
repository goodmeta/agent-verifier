/**
 * Root SD-JWT verification + disclosure resolution.
 *
 * Signatures: verified by jose, ES256-pinned, key supplied out-of-band — never
 * by a disclosure library, never resolving a header `jwk`/`jku`/`x5u`/`kid`.
 *
 * Disclosure resolution mirrors AP2's actual reference behavior, which is a
 * hybrid of THREE layers (AP2's golden vectors are minted by the Python
 * `sd_jwt` lib + AP2's own post-passes, so we mirror that exact stack, not the
 * unrelated TS `@sd-jwt` lib):
 *
 *   A. Standard RFC 9901 unpack — port of `sd_jwt` lib
 *      `SDJWTVerifier._unpack_disclosed_claims`: resolve `{"...": digest}` array
 *      elements ([salt, value]) and `_sd: [digest]` object members
 *      ([salt, name, value]) against the token's disclosures; strip `_sd` /
 *      `_sd_alg`; reject duplicate disclosure hashes, duplicate `_sd` digests,
 *      and duplicate disclosed keys. Only sha-256 (the lib rejects others).
 *   B. AP2 delegate-item resolution — port of `chain.py::_resolve_delegate_items`
 *      + `_inline_sd_claims`: walk a resolved `delegate_payload` array; for dict
 *      items, inline any remaining object-property `_sd` digests; decode any
 *      bare-string items into their dict value.
 *   C. CMWallet quirk — port of `kb_sd_jwt.py::_resolve_delegate_payload` +
 *      `_try_resolve_digest`: `delegate_payload` items that are bare digest
 *      STRINGS get replaced in place by the dict value of the matching
 *      disclosure (used by KB hops in P3).
 *
 * Validated byte-exact against `test/fixtures/ap2-vectors.json`
 * (`expectedPayloads`), minted from AP2's own SDK.
 */

import { Buffer } from "node:buffer";
import { compactVerify, type CryptoKey, type JWK as JoseJwk, type KeyObject } from "jose";
import type { ParsedToken } from "./parse.js";
import { computeDisclosureDigest } from "./hash.js";
import { parseJwk, type Jwk } from "./jwk.js";

/** A jose-importable verification key, or a bare JWK jose imports for us. */
export type VerificationKey = CryptoKey | KeyObject | JoseJwk | Uint8Array;

const SD_DIGESTS_KEY = "_sd";
const DIGEST_ALG_KEY = "_sd_alg";
const SD_LIST_PREFIX = "...";
const SUPPORTED_SD_ALG = "sha-256";

const ARRAY_DISCLOSURE_LEN = 2; // [salt, value]
const PROPERTY_DISCLOSURE_LEN = 3; // [salt, name, value]

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeDisclosure(disclosure: string): unknown[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(disclosure, "base64url").toString("utf8"));
  } catch (e) {
    throw new Error(`Cannot decode disclosure: ${(e as Error).message}`);
  }
  if (!Array.isArray(decoded)) {
    throw new Error("Disclosure must decode to a JSON array");
  }
  return decoded;
}

// ── Layer A: standard RFC 9901 unpack (sd_jwt lib) ───────────────────────────

/**
 * Map every disclosure to its decoded array, keyed by its digest. Mirrors
 * `_create_hash_mappings`: a duplicate digest is an error.
 */
function buildDisclosureMap(disclosures: string[], sdAlg: string | undefined): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  for (const d of disclosures) {
    const digest = computeDisclosureDigest(d, sdAlg);
    if (map.has(digest)) {
      throw new Error(`Duplicate disclosure hash ${digest}`);
    }
    map.set(digest, decodeDisclosure(d));
  }
  return map;
}

/** `{"...": "<digest>"}` array-element form (RFC 9901 §4.2.4.1). */
function arrayElementDigest(el: unknown): string | null {
  if (!isPlainObject(el)) return null;
  const keys = Object.keys(el);
  if (keys.length === 1 && keys[0] === SD_LIST_PREFIX && typeof el[SD_LIST_PREFIX] === "string") {
    return el[SD_LIST_PREFIX] as string;
  }
  return null;
}

/**
 * Recursively replace disclosed digests with their values. Port of the
 * `sd_jwt` lib `_unpack_disclosed_claims`. `dupCheck` tracks `_sd` digests
 * across the whole payload so a reused digest is rejected.
 */
function unpack(claims: unknown, map: Map<string, unknown[]>, dupCheck: Set<unknown>): unknown {
  if (Array.isArray(claims)) {
    const output: unknown[] = [];
    for (const element of claims) {
      const digest = arrayElementDigest(element);
      if (digest !== null) {
        const decoded = map.get(digest);
        if (decoded !== undefined) {
          if (decoded.length !== ARRAY_DISCLOSURE_LEN) {
            throw new Error(`Array-element disclosure must be [salt, value], got length ${decoded.length}`);
          }
          output.push(unpack(decoded[1], map, dupCheck));
        }
        // undisclosed / decoy digest → element is omitted
      } else {
        output.push(unpack(element, map, dupCheck));
      }
    }
    return output;
  }

  if (isPlainObject(claims)) {
    const preOutput: Json = {};
    for (const [k, v] of Object.entries(claims)) {
      if (k !== SD_DIGESTS_KEY && k !== DIGEST_ALG_KEY) {
        preOutput[k] = unpack(v, map, dupCheck);
      }
    }
    const sd = claims[SD_DIGESTS_KEY];
    if (Array.isArray(sd)) {
      for (const digest of sd) {
        // Mirror the Python lib: every `_sd` entry is duplicate-tracked before
        // the map lookup (even a non-string one), so a repeated digest is
        // rejected regardless of type. Only string digests can match a real
        // disclosure; others fall through (map.get returns undefined).
        if (dupCheck.has(digest)) {
          throw new Error(`Duplicate hash found in SD-JWT: ${String(digest)}`);
        }
        dupCheck.add(digest);
        const decoded = typeof digest === "string" ? map.get(digest) : undefined;
        if (decoded !== undefined) {
          if (decoded.length !== PROPERTY_DISCLOSURE_LEN) {
            throw new Error(`Object-property disclosure must be [salt, name, value], got length ${decoded.length}`);
          }
          const key = decoded[1] as string;
          if (key in preOutput) {
            throw new Error(`Duplicate key found when unpacking disclosed claim: '${key}'`);
          }
          preOutput[key] = unpack(decoded[2], map, dupCheck);
        }
      }
    }
    return preOutput;
  }

  return claims;
}

/**
 * Resolve all disclosures in an issuer-verified payload (Layer A). Mirrors
 * `_extract_sd_claims`: rejects a non-sha-256 `_sd_alg` (the lib supports only
 * sha-256), then unpacks.
 */
export function resolveDisclosures(payload: Json, disclosures: string[], sdAlg: string | undefined): Json {
  if (sdAlg !== undefined && sdAlg !== SUPPORTED_SD_ALG) {
    throw new Error(`Invalid hash algorithm: ${sdAlg} (only ${SUPPORTED_SD_ALG} supported)`);
  }
  const map = buildDisclosureMap(disclosures, sdAlg);
  return unpack(payload, map, new Set<unknown>()) as Json;
}

// ── Layer C: CMWallet bare-digest-string resolution (kb_sd_jwt.py) ───────────

/** First disclosure whose digest equals `digest`, returned as its dict value. */
function tryResolveDigest(digest: string, disclosures: string[], sdAlg: string | undefined): Json | null {
  for (const disc of disclosures) {
    if (computeDisclosureDigest(disc, sdAlg) !== digest) continue;
    let arr: unknown;
    try {
      arr = JSON.parse(Buffer.from(disc, "base64url").toString("utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    const val =
      arr.length === ARRAY_DISCLOSURE_LEN ? arr[1] : arr.length === PROPERTY_DISCLOSURE_LEN ? arr[2] : null;
    if (isPlainObject(val)) return val;
  }
  return null;
}

/**
 * Resolve bare digest-string items inside `delegate_payload` in place. Port of
 * `kb_sd_jwt.py::_resolve_delegate_payload`: dict items are left unchanged;
 * string items are replaced by the matching disclosure's dict value (or kept
 * as-is when no disclosure matches).
 */
export function resolveDelegatePayload(payload: Json, token: ParsedToken): void {
  const dp = payload["delegate_payload"];
  if (!Array.isArray(dp) || token.disclosures.length === 0) return;
  payload["delegate_payload"] = dp.map((item) => {
    if (isPlainObject(item)) return item;
    if (typeof item === "string") {
      const decoded = tryResolveDigest(item, token.disclosures, token.sdAlg);
      return decoded ?? item;
    }
    return item;
  });
}

// ── Layer B: AP2 delegate-item resolution (chain.py) ─────────────────────────

/** Inline object-property `_sd` digests into a delegate item in place. */
function inlineSdClaims(item: Json, token: ParsedToken): void {
  const sdDigests = item[SD_DIGESTS_KEY];
  if (!Array.isArray(sdDigests) || sdDigests.length === 0 || token.disclosures.length === 0) return;
  for (const digest of sdDigests) {
    for (const d of token.disclosures) {
      if (computeDisclosureDigest(d, token.sdAlg) === digest) {
        const decoded = decodeDisclosure(d);
        if (decoded.length === PROPERTY_DISCLOSURE_LEN) {
          item[decoded[1] as string] = decoded[2];
        }
        break;
      }
    }
  }
}

/** Decode a bare disclosure string into its dict value, if it has one. */
function decodeDisclosureDict(disclosure: string): Json | null {
  let arr: unknown;
  try {
    arr = JSON.parse(Buffer.from(disclosure, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const val =
    arr.length === PROPERTY_DISCLOSURE_LEN ? arr[2] : arr.length === ARRAY_DISCLOSURE_LEN ? arr[1] : null;
  return isPlainObject(val) ? val : null;
}

/**
 * Resolve the effective delegate items from a verified payload's
 * `delegate_payload`. Port of `chain.py::_resolve_delegate_items`.
 */
export function resolveDelegateItems(delegatePayload: unknown, token: ParsedToken): Json[] {
  if (!Array.isArray(delegatePayload)) return [];
  const items: Json[] = [];
  for (const item of delegatePayload) {
    if (isPlainObject(item)) {
      inlineSdClaims(item, token);
      items.push(item);
    } else if (typeof item === "string") {
      const decoded = decodeDisclosureDict(item);
      if (decoded !== null) items.push(decoded);
    }
  }
  return items;
}

// ── Root SD-JWT verify ───────────────────────────────────────────────────────

export interface ResolvedToken {
  /** The parsed token this resolution belongs to. */
  token: ParsedToken;
  /** Full issuer-verified payload after Layer A disclosure resolution. */
  verifiedPayload: Json;
  /** Effective delegate items (Layer B) — `[OpenMandate]` for a payment root. */
  delegateItems: Json[];
}

/** Verify one ES256 compact JWS signature; throws on any failure. Key is supplied
 * out-of-band — a header `jwk`/`jku`/`x5u`/`kid` is NEVER trusted to pick it. */
export async function verifyEs256(issuerJwt: string, key: VerificationKey): Promise<void> {
  await compactVerify(issuerJwt, key as Parameters<typeof compactVerify>[1], { algorithms: ["ES256"] });
}

/**
 * Verify the root issuer JWT signature (ES256, pinned) and resolve its
 * disclosures. `key` is the issuer's public key, supplied out-of-band (x5c/kid
 * trust is resolved by the caller in P4).
 */
export async function verifyRootSdJwt(token: ParsedToken, key: VerificationKey): Promise<ResolvedToken> {
  await verifyEs256(token.issuerJwt, key);
  const verifiedPayload = resolveDisclosures(token.payload, token.disclosures, token.sdAlg);
  const delegateItems = resolveDelegateItems(verifiedPayload["delegate_payload"], token);
  return { token, verifiedPayload, delegateItems };
}

// ── cnf.jwk resolution (3-tier `_find_cnf`, + single-cnf hardening H3) ────────

function cnfDict(value: unknown): Json | null {
  return isPlainObject(value) && isPlainObject(value["jwk"]) ? value : null;
}

function firstCnfInList(list: unknown): Json | null {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (isPlainObject(item)) {
      const c = cnfDict(item["cnf"]);
      if (c) return c;
    }
  }
  return null;
}

/**
 * Resolve the `cnf.jwk` that the NEXT hop must be signed under. Port of AP2's
 * `common.py::_find_cnf` (3-tier: delegate_items[*].cnf → verified
 * delegate_payload[*].cnf → top-level cnf), returned as a strict EC-P256 JWK.
 *
 * Hardening H3 (stricter than AP2's first-match): reject if MORE THAN ONE
 * delegate item carries a `cnf` — a disclosure-injected second `cnf` must not be
 * able to silently win. (The signed-`_sd` binding refinement is pending a
 * crafted ambiguous-cnf vector.)
 */
export function cnfJwk(resolved: ResolvedToken): Jwk {
  const itemsWithCnf = resolved.delegateItems.filter((it) => cnfDict(it["cnf"]) !== null);
  if (itemsWithCnf.length > 1) {
    throw new Error("Ambiguous cnf: more than one delegate item carries a cnf claim");
  }
  const cnf =
    (itemsWithCnf[0] ? cnfDict(itemsWithCnf[0]["cnf"]) : null) ??
    firstCnfInList(resolved.verifiedPayload["delegate_payload"]) ??
    cnfDict(resolved.verifiedPayload["cnf"]);
  if (!cnf) throw new Error("Previous token missing cnf.jwk");
  const jwk = parseJwk(cnf["jwk"]);
  if (!jwk) throw new Error("cnf.jwk is not a valid EC P-256 JWK");
  return jwk;
}
