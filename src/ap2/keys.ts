/**
 * Root-token trust anchoring: x5c (certificate chain) or kid lookup.
 *
 * Wire format follows AP2's `chain.py::X5cOrKidPublicKeyProvider` (H7): the x5c
 * header is a list of **base64url**-DER certs, leaf first, `cert[i]` signed by
 * `cert[i+1]`, and the chain is anchored when the LAST cert is signed by a
 * trusted root that is itself NOT in the chain.
 *
 * Trust is STRICTER than AP2 (H2 — AP2's x5c path FAILS OPEN: with no configured
 * roots it accepts a self-signed leaf, and it checks no validity / CA / curve /
 * name chaining). We fail closed:
 *   - `trustedRoots` is MANDATORY when an x5c is present (else refuse, no fail-open).
 *   - every cert must be inside its validity window;
 *   - each issuer cert must assert `basicConstraints CA:TRUE`;
 *   - issuer/subject names must chain (`checkIssued`) AND signatures verify;
 *   - the leaf must be an EC P-256 key;
 *   - the chain must anchor to a trusted root (AP2-compatible: root not in chain).
 *
 * KNOWN LIMITATION: node's `X509Certificate` does not expose the basic
 * KeyUsage / pathLenConstraint extensions (`.keyUsage` returns only EXTENDED key
 * usage), so we cannot enforce `keyCertSign` / `digitalSignature` / pathLen
 * without hand-parsing DER. We rely on `CA:TRUE` for the CA constraint and leave
 * basic-keyUsage enforcement as a documented refinement (PLAN §5 H2).
 */

import { Buffer } from "node:buffer";
import { X509Certificate } from "node:crypto";
import type { ParsedToken } from "./parse.js";
import type { RootKeyProvider } from "./chain.js";
import type { VerificationKey } from "./sd-jwt.js";

const MAX_X5C_CHAIN = 8;

export interface X5cKidProviderOptions {
  /** REQUIRED whenever a root token presents an x5c header (fail-closed, H2). */
  trustedRoots?: X509Certificate[];
  /** Resolve a verification key by `kid` when no x5c is present. */
  kidLookup?: (kid: string) => VerificationKey | null;
  /** Validity-window reference time; defaults to the current time. */
  currentTime?: Date;
}

function isP256(cert: X509Certificate): boolean {
  const key = cert.publicKey;
  return key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1";
}

/** `validFromDate`/`validToDate` exist at runtime (Node 18.13+) but aren't in the
 * pinned `@types/node`; fall back to parsing the string form. */
function certDate(cert: X509Certificate, which: "from" | "to"): Date {
  const runtime = (cert as unknown as { validFromDate?: Date; validToDate?: Date })[
    which === "from" ? "validFromDate" : "validToDate"
  ];
  return runtime instanceof Date ? runtime : new Date(which === "from" ? cert.validFrom : cert.validTo);
}

function withinValidity(cert: X509Certificate, now: Date): boolean {
  return now >= certDate(cert, "from") && now <= certDate(cert, "to");
}

function resolveX5cKey(x5c: unknown, trustedRoots: X509Certificate[], now: Date): VerificationKey {
  if (!Array.isArray(x5c) || x5c.length === 0) throw new Error("x5c header must be a non-empty array");
  if (x5c.length > MAX_X5C_CHAIN) throw new Error(`x5c chain too long (> ${MAX_X5C_CHAIN})`);
  const certs = x5c.map((b64, i) => {
    if (typeof b64 !== "string") throw new Error(`x5c[${i}] must be a base64url string`);
    return new X509Certificate(Buffer.from(b64, "base64url")); // base64url to match AP2's decoder
  });

  // Every cert must be inside its validity window.
  certs.forEach((c, i) => {
    if (!withinValidity(c, now)) throw new Error(`x5c cert ${i} is outside its validity window`);
  });

  // Chain links: cert[i] is signed by, and named-chained to, cert[i+1]; the
  // issuer must be a CA.
  for (let i = 0; i < certs.length - 1; i++) {
    const sub = certs[i];
    const iss = certs[i + 1];
    if (!sub.verify(iss.publicKey)) throw new Error(`x5c cert ${i} signature is not from cert ${i + 1}`);
    // CA check first: node's checkIssued also rejects a non-CA issuer, so the
    // explicit constraint must run before it to surface the precise reason.
    if (!iss.ca) throw new Error(`x5c cert ${i + 1} is not a CA (basicConstraints CA:TRUE required)`);
    if (!sub.checkIssued(iss)) throw new Error(`x5c cert ${i} does not chain (issuer name) to cert ${i + 1}`);
  }

  // The leaf (signing) cert must be an EC P-256 key.
  if (!isP256(certs[0])) throw new Error("x5c leaf is not an EC P-256 key");

  // Trust anchor (H7, AP2-compatible): the last cert must be signed by some
  // trusted root that is NOT part of the chain.
  const last = certs[certs.length - 1];
  const anchored = trustedRoots.some((root) => {
    try {
      return last.verify(root.publicKey) && last.checkIssued(root);
    } catch {
      return false;
    }
  });
  if (!anchored) throw new Error("x5c chain does not chain to a trusted root");

  return certs[0].publicKey; // leaf public key verifies the root SD-JWT signature
}

/**
 * Build a root-key provider that resolves an x5c chain (fail-closed) or, absent
 * x5c, a `kid` via `kidLookup`. Plug into `verifyChain(tokens, provider, …)`.
 */
export function x5cOrKidProvider(opts: X5cKidProviderOptions = {}): RootKeyProvider {
  const now = opts.currentTime ?? new Date();
  return (root: ParsedToken): VerificationKey => {
    const header = root.header;
    if ("x5c" in header) {
      if (!opts.trustedRoots || opts.trustedRoots.length === 0) {
        throw new Error("x5c present but no trustedRoots configured — refusing to fail open");
      }
      return resolveX5cKey(header["x5c"], opts.trustedRoots, now);
    }
    const kid = header["kid"];
    if (typeof kid !== "string" || kid === "") {
      throw new Error("Root token header has neither 'x5c' nor a usable 'kid'");
    }
    if (!opts.kidLookup) throw new Error("Root token uses 'kid' but no kidLookup is configured");
    const key = opts.kidLookup(kid);
    if (!key) throw new Error(`No key registered for kid: ${kid}`);
    return key;
  };
}
