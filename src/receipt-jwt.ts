/**
 * Receipt signing & verification — ES256 JWS (JWT), AP2's RECEIPT format.
 *
 * This is a plain compact JWS over a whole JSON payload (alg ES256, JWK keys) —
 * which is exactly how AP2 secures a *Mandate Receipt* (a Verifier-signed JWT
 * with `iss`/`result`/`reference`; see AP2 `jwt_helper.py`). It is NOT how AP2
 * secures a *mandate*: real AP2 mandates are dSD-JWT delegation chains — use the
 * `ap2` namespace (`ap2.verifyChain`, `ap2.receiptReference`, …) for those.
 *
 * Because the whole payload is signed, no field is mutable without breaking the
 * signature — there is no "signed subset vs enforced superset" gap.
 *
 *   const token = await signReceipt(receipt, privateJwk);   // compact JWS string
 *   const { valid, payload } = await verifyReceipt(token, publicJwk);
 */

import { CompactSign, compactVerify, importJWK, type JWK } from "jose";

const ALG = "ES256";

/** Sign a receipt as a compact JWS (ES256) over the whole payload. */
export async function signReceipt(receipt: unknown, privateKey: JWK): Promise<string> {
  const key = await importJWK(privateKey, ALG);
  return new CompactSign(new TextEncoder().encode(JSON.stringify(receipt)))
    .setProtectedHeader({ alg: ALG })
    .sign(key);
}

export interface VerifiedReceipt<T = unknown> {
  valid: boolean;
  payload?: T;
  error?: string;
}

/**
 * Verify a compact JWS receipt (ES256) and return the parsed payload.
 * Returns { valid:false, error } on a bad signature, wrong key, or malformed token.
 */
export async function verifyReceipt<T = unknown>(token: string, publicKey: JWK): Promise<VerifiedReceipt<T>> {
  try {
    const key = await importJWK(publicKey, ALG);
    const { payload } = await compactVerify(token, key, { algorithms: [ALG] });
    return { valid: true, payload: JSON.parse(new TextDecoder().decode(payload)) as T };
  } catch (e) {
    return { valid: false, error: (e as Error)?.message || "verification failed" };
  }
}

export type { JWK };
