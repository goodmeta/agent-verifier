/**
 * KB-SD-JWT delegation-hop verification.
 *
 * Line-for-line port of AP2's `sdjwt/kb_sd_jwt.py::verify` plus the binding /
 * expected-claim helpers from `sdjwt/common.py`. The exact order matters and
 * mirrors AP2:
 *   1. `typ` is a known AP2 KB type (terminal `kb+sd-jwt`/`kb-sd-jwt`, or
 *      intermediate `kb+sd-jwt+kb`/`kb-sd-jwt+kb`).
 *   2. Signature verifies (ES256, pinned) under the PREVIOUS hop's `cnf.jwk`.
 *   3. Resolve `delegate_payload` digests (CMWallet quirk) FIRST.
 *   4. Binding: exactly one of `sd_hash`/`issuer_jwt_hash`, equal to the hash of
 *      the previous on-wire token. Both-present AND both-absent are errors.
 *   5. Terminal hop → enforce expected aud/nonce (when provided) + `iat`.
 *   6. cnf presence: terminal MUST NOT carry `cnf`; intermediate MUST.
 *
 * The "aud+nonce are mandatory for any KB-bearing chain" hardening (H4) is
 * enforced one level up in `chain.ts`, matching AP2's structure (AP2 only
 * checks them on the terminal hop, and only if the caller supplied them).
 */

import type { ParsedToken } from "./parse.js";
import { computeSdHash, computeIssuerJwtHash } from "./hash.js";
import { verifyEs256, resolveDisclosures, resolveDelegatePayload, cnfJwk, type ResolvedToken } from "./sd-jwt.js";

const TYP_TERMINAL = ["kb+sd-jwt", "kb-sd-jwt"];
const TYP_INTERMEDIATE = ["kb+sd-jwt+kb", "kb-sd-jwt+kb"];

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exactly one of `sd_hash`/`issuer_jwt_hash`, matching the hash of `prev`. */
export function verifyBinding(payload: Json, prev: ParsedToken): void {
  const hasSd = "sd_hash" in payload;
  const hasIss = "issuer_jwt_hash" in payload;
  if (hasSd === hasIss) {
    throw new Error(
      `KB-SD-JWT payload must contain exactly one of 'sd_hash' or 'issuer_jwt_hash' ` +
        `(got sd_hash=${hasSd}, issuer_jwt_hash=${hasIss})`,
    );
  }
  if (hasSd) {
    const expected = computeSdHash(prev);
    if (payload["sd_hash"] !== expected) {
      throw new Error(`sd_hash mismatch: expected '${expected}', got '${String(payload["sd_hash"])}'`);
    }
  } else {
    const expected = computeIssuerJwtHash(prev);
    if (payload["issuer_jwt_hash"] !== expected) {
      throw new Error(`issuer_jwt_hash mismatch: expected '${expected}', got '${String(payload["issuer_jwt_hash"])}'`);
    }
  }
}

/** Validate `iat` presence and, when provided, `aud`/`nonce` (port of
 * `verify_expected_claims`; the "always required" tightening lives in chain.ts). */
export function verifyExpectedClaims(
  payload: Json,
  expectedAud: string | undefined,
  expectedNonce: string | undefined,
  label = "KB-SD-JWT",
): void {
  if (!("iat" in payload)) throw new Error(`${label} missing required 'iat' claim`);
  if (expectedAud !== undefined && payload["aud"] !== expectedAud) {
    throw new Error(`${label} aud mismatch: expected '${expectedAud}', got '${String(payload["aud"])}'`);
  }
  if (expectedNonce !== undefined && payload["nonce"] !== expectedNonce) {
    throw new Error(`${label} nonce mismatch: expected '${expectedNonce}', got '${String(payload["nonce"])}'`);
  }
}

function delegatePayloadHasCnf(payload: Json): boolean {
  const dp = payload["delegate_payload"];
  if (!Array.isArray(dp)) return false;
  return dp.some((item) => isPlainObject(item) && isPlainObject(item["cnf"]));
}

export interface KbHopOptions {
  /** Enforced only on the terminal hop, and only when provided (chain.ts makes
   * them mandatory for any KB-bearing chain — hardening H4). */
  expectedAud?: string;
  expectedNonce?: string;
}

/**
 * Verify one KB-SD-JWT hop against the previous (already verified+resolved)
 * token, returning this hop's verified, disclosure-resolved payload.
 */
export async function verifyKbHop(token: ParsedToken, prev: ResolvedToken, opts: KbHopOptions = {}): Promise<Json> {
  const typ = token.typ;
  const isTerminal = typ !== undefined && TYP_TERMINAL.includes(typ);
  const isIntermediate = typ !== undefined && TYP_INTERMEDIATE.includes(typ);
  if (!isTerminal && !isIntermediate) {
    throw new Error(
      `Unexpected JWT typ: expected one of ${[...TYP_TERMINAL, ...TYP_INTERMEDIATE].join(", ")}, got '${String(typ)}'`,
    );
  }

  const prevKey = cnfJwk(prev); // 3-tier _find_cnf + single-cnf hardening (H3)
  await verifyEs256(token.issuerJwt, prevKey); // ES256 under prev's cnf.jwk
  const payload = resolveDisclosures(token.payload, token.disclosures, token.sdAlg);
  resolveDelegatePayload(payload, token); // CMWallet digest-string resolution FIRST
  verifyBinding(payload, prev.token);
  if (isTerminal) verifyExpectedClaims(payload, opts.expectedAud, opts.expectedNonce);

  const hasCnf = delegatePayloadHasCnf(payload);
  if (isTerminal && hasCnf) throw new Error("Terminal KB-SD-JWT MUST NOT carry a 'cnf' claim");
  if (isIntermediate && !hasCnf) throw new Error(`Intermediate ${typ} requires a 'cnf' claim`);
  return payload;
}
