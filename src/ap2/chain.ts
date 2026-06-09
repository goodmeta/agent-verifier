/**
 * dSD-JWT delegation-chain walk.
 *
 * Port of AP2's `sdjwt/chain.py::verify_chain` (+ `_check_time_claims`):
 * verify the root SD-JWT, then each KB-SD-JWT hop under the previous hop's
 * `cnf.jwk`, returning one effective payload per hop (`[open, …, closed]`).
 *
 * Hardenings over AP2's reference (PLAN §5):
 *   H4 — `expectedAud`+`expectedNonce` are REQUIRED for any chain that has KB
 *        hops (AP2 leaves them optional); fail closed if absent.
 *   H5 — DoS caps enforced BEFORE any crypto (chain depth, per-token bytes,
 *        disclosures per token).
 * The signature/binding/typ/cnf checks live in the per-primitive modules
 * (`sd-jwt.ts`, `kb-sd-jwt.ts`), as in AP2.
 */

import type { ParsedToken } from "./parse.js";
import { verifyRootSdJwt, resolveDelegateItems, type ResolvedToken, type VerificationKey } from "./sd-jwt.js";
import { verifyKbHop } from "./kb-sd-jwt.js";

type Json = Record<string, unknown>;

/** DoS caps (H5) — frozen so a consumer of the public barrel can't weaken them
 * process-wide (`as const` is compile-time only). */
export const CHAIN_CAPS = Object.freeze({
  maxDepth: 8,
  maxTokenBytes: 64 * 1024,
  maxDisclosuresPerToken: 64,
});

const DEFAULT_CLOCK_SKEW_SECONDS = 300;

/** Resolves the root token's verification key (x5c/kid trust → P4). */
export type RootKeyProvider = (root: ParsedToken) => VerificationKey;

export interface VerifyChainOptions {
  expectedAud?: string;
  expectedNonce?: string;
  clockSkewSeconds?: number;
  /** Unix seconds; defaults to the current time. Override for reproducible tests. */
  currentTime?: number;
}

function enforceCaps(tokens: ParsedToken[]): void {
  if (tokens.length > CHAIN_CAPS.maxDepth) {
    throw new Error(`Chain too deep: ${tokens.length} tokens > cap ${CHAIN_CAPS.maxDepth}`);
  }
  tokens.forEach((t, i) => {
    if (t.canonical.length > CHAIN_CAPS.maxTokenBytes) {
      throw new Error(`Token ${i} exceeds ${CHAIN_CAPS.maxTokenBytes} bytes`);
    }
    if (t.disclosures.length > CHAIN_CAPS.maxDisclosuresPerToken) {
      throw new Error(`Token ${i} has ${t.disclosures.length} disclosures > cap ${CHAIN_CAPS.maxDisclosuresPerToken}`);
    }
  });
}

/** Port of `_check_time_claims`: reject expired tokens and future-dated `iat`. */
function checkTimeClaims(payloads: Json[], tokenIndex: number, now: number, skew: number): void {
  for (const p of payloads) {
    const exp = p["exp"];
    if (exp !== undefined && exp !== null) {
      if (typeof exp !== "number") throw new Error(`Token ${tokenIndex} has invalid 'exp' claim type`);
      if (now > exp + skew) throw new Error(`Token ${tokenIndex} expired at ${exp}`);
    }
    const iat = p["iat"];
    if (iat !== undefined && iat !== null) {
      if (typeof iat !== "number") throw new Error(`Token ${tokenIndex} has invalid 'iat' claim type`);
      if (iat > now + skew) throw new Error(`Token ${tokenIndex} iat is in the future: ${iat}`);
    }
  }
}

/**
 * Verify a dSD-JWT delegation chain and return per-hop effective payloads.
 *
 * @param tokens    parsed chain segments (root first), e.g. from `splitChain`.
 * @param rootKey   the root issuer key, or a provider `(root) => key` (P4 x5c/kid).
 */
export async function verifyChain(
  tokens: ParsedToken[],
  rootKey: VerificationKey | RootKeyProvider,
  opts: VerifyChainOptions = {},
): Promise<Json[]> {
  if (tokens.length === 0) throw new Error("Tokens list cannot be empty");
  enforceCaps(tokens); // H5 — before any crypto

  // H4 — aud+nonce mandatory for any KB-bearing chain (fail closed).
  if (tokens.length > 1 && (!opts.expectedAud || !opts.expectedNonce)) {
    throw new Error("expectedAud and expectedNonce are required to verify a chain with KB-SD-JWT hops");
  }

  const skew = opts.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const now = opts.currentTime ?? Math.floor(Date.now() / 1000);
  const payloads: Json[] = [];

  // Root (index 0).
  const rootKeyResolved = typeof rootKey === "function" ? rootKey(tokens[0]) : rootKey;
  let prev: ResolvedToken = await verifyRootSdJwt(tokens[0], rootKeyResolved);
  checkTimeClaims([prev.verifiedPayload], 0, now, skew);
  checkTimeClaims(prev.delegateItems, 0, now, skew);
  payloads.push(...(prev.delegateItems.length ? prev.delegateItems : [prev.verifiedPayload]));

  // KB-SD-JWT hops (index 1..n-1) verify under the previous hop's cnf.jwk.
  for (let i = 1; i < tokens.length; i++) {
    const isLast = i === tokens.length - 1;
    const payload = await verifyKbHop(tokens[i], prev, {
      expectedAud: isLast ? opts.expectedAud : undefined,
      expectedNonce: isLast ? opts.expectedNonce : undefined,
      requireTerminal: isLast, // H4 anti-truncation: last hop must be terminal-typ
    });
    const delegateItems = resolveDelegateItems(payload["delegate_payload"], tokens[i]);
    if (!isLast && delegateItems.length > 1) {
      throw new Error(`Token ${i}: delegate_payload has ${delegateItems.length} disclosed items, expected exactly 1`);
    }
    checkTimeClaims([payload], i, now, skew);
    checkTimeClaims(delegateItems, i, now, skew);
    payloads.push(...(delegateItems.length ? delegateItems : [payload]));
    prev = { token: tokens[i], verifiedPayload: payload, delegateItems };
  }

  return payloads;
}
