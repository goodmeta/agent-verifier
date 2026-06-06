/**
 * Mandate signing & verification — ES256 JWS (JWT), matching AP2.
 *
 * AP2 signs a mandate as a compact JWS over the ENTIRE mandate JSON, alg ES256,
 * using JWK keys (see AP2's jwt_helper.py: jwcrypto JWS + ES256). We do the same
 * with `jose`. Because the whole payload is signed, no field is mutable without
 * breaking the signature — there is no "signed subset vs enforced superset" gap.
 *
 *   const token = await signMandate(mandate, privateJwk);   // compact JWS string
 *   const { valid, mandate } = await verifyMandate(token, publicJwk);
 */

import { CompactSign, compactVerify, importJWK, type JWK } from "jose";

const ALG = "ES256";

/** Sign a mandate as a compact JWS (ES256) over the whole payload. */
export async function signMandate(mandate: unknown, privateKey: JWK): Promise<string> {
  const key = await importJWK(privateKey, ALG);
  return new CompactSign(new TextEncoder().encode(JSON.stringify(mandate)))
    .setProtectedHeader({ alg: ALG })
    .sign(key);
}

export interface VerifiedMandate<T = unknown> {
  valid: boolean;
  mandate?: T;
  error?: string;
}

/**
 * Verify a compact JWS mandate (ES256) and return the parsed payload.
 * Returns { valid:false, error } on a bad signature, wrong key, or malformed token.
 */
export async function verifyMandate<T = unknown>(
  token: string,
  publicKey: JWK
): Promise<VerifiedMandate<T>> {
  try {
    const key = await importJWK(publicKey, ALG);
    const { payload } = await compactVerify(token, key, { algorithms: [ALG] });
    return { valid: true, mandate: JSON.parse(new TextDecoder().decode(payload)) as T };
  } catch (e) {
    return { valid: false, error: (e as Error)?.message || "verification failed" };
  }
}

export type { JWK };
