/**
 * dSD-JWT parsing + canonical serialization.
 *
 * Byte-exact port of AP2's `sdjwt/common.py` (`ParsedToken`, `parse_token`) and
 * `mandate.py` (`_canonical_chain_segment`). The canonical strings produced here
 * feed the binding hashes (hash.ts), so a 1-byte divergence breaks every
 * `sd_hash`/`issuer_jwt_hash` comparison — these are tested byte-exact against
 * vectors minted by AP2's own SDK (test/fixtures/ap2-hash-pairs.json).
 */

const JWT_PARTS = 3;

export interface ParsedToken {
  issuerJwt: string;
  disclosures: string[];
  kbJwt: string | null;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** `_sd_alg` from the payload, if a string. */
  sdAlg?: string;
  /** `issuer_jwt + '~' + disclosures.join('~') + '~'` (no KB segment). */
  sdJwt: string;
  /** `sdJwt + kbJwt` when a trailing KB-JWT is present, else `sdJwt`. */
  canonical: string;
  /** `typ` from the protected header, if a string. */
  typ?: string;
}

function decodeSegment(segment: string, part: "header" | "payload"): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch (e) {
    throw new Error(`Cannot parse JWT ${part}: ${(e as Error).message}`);
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new Error(`JWT ${part} must decode to a JSON object`);
  }
  return decoded as Record<string, unknown>;
}

/** Parse + canonicalize a compact SD-JWT token (one chain segment). */
export function parseToken(token: string): ParsedToken {
  if (token.startsWith("~")) throw new Error("Malformed SD-JWT: empty issuer JWT");
  if (!token.includes("~")) throw new Error("Malformed SD-JWT: missing disclosure separator");

  const parts = token.split("~");
  const issuerJwt = parts[0];
  const disclosureParts = parts.slice(1, -1);
  if (disclosureParts.some((d) => d === "")) {
    throw new Error("Malformed SD-JWT: empty disclosure segment");
  }

  let kbJwt: string | null;
  if (token.endsWith("~")) {
    kbJwt = null;
  } else {
    kbJwt = parts[parts.length - 1];
    if (kbJwt.split(".").length !== JWT_PARTS) {
      throw new Error("Malformed KB-JWT: expected header.payload.signature");
    }
  }
  const disclosures = disclosureParts;

  const jwtParts = issuerJwt.split(".");
  if (jwtParts.length !== JWT_PARTS) {
    throw new Error("Malformed SD-JWT: issuer JWT must have header.payload.signature");
  }
  const header = decodeSegment(jwtParts[0], "header");
  const payload = decodeSegment(jwtParts[1], "payload");

  const sdAlg = typeof payload["_sd_alg"] === "string" ? (payload["_sd_alg"] as string) : undefined;
  const sdJwt = disclosures.length ? `${issuerJwt}~${disclosures.join("~")}~` : `${issuerJwt}~`;
  const canonical = kbJwt ? sdJwt + kbJwt : sdJwt;
  const typ = typeof header["typ"] === "string" ? (header["typ"] as string) : undefined;

  return { issuerJwt, disclosures, kbJwt, header, payload, sdAlg, sdJwt, canonical, typ };
}

/**
 * Restore the trailing `~` that the `~~` join consumed from a non-final segment.
 * Port of `_canonical_chain_segment`: leave it alone if it's the final segment,
 * already ends with `~`, or ends in a 3-part KB-JWT; otherwise append `~`.
 */
export function canonicalChainSegment(segment: string, index: number, total: number): string {
  if (index === total - 1 || segment.endsWith("~")) return segment;
  const idx = segment.lastIndexOf("~");
  const last = idx === -1 ? segment : segment.slice(idx + 1);
  if (last.split(".").length === JWT_PARTS) return segment;
  return segment + "~";
}

/** Split a compact dSD-JWT chain on `~~`, restore each segment, and parse. */
export function splitChain(compact: string): ParsedToken[] {
  const segs = compact.split("~~");
  return segs.map((s, i) => parseToken(canonicalChainSegment(s, i, segs.length)));
}
