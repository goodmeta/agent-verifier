/**
 * Strict EC P-256 JWK validation.
 *
 * Mirrors AP2's `generated/types/jwk.py` (Pydantic `extra='forbid'`): kty='EC',
 * crv='P-256', alg='ES256', x/y are 43-char base64url. We pin P-256/ES256 — our
 * documented ES256-only narrowing — and reject unknown members so a `cnf.jwk`
 * can't smuggle extra fields.
 */

import { z } from "zod";

const B64URL_43 = /^[A-Za-z0-9_-]{43}$/;

export const JwkSchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().regex(B64URL_43),
    y: z.string().regex(B64URL_43),
    alg: z.literal("ES256").optional(),
    kid: z.string().optional(),
    use: z.string().optional(),
    x5c: z.array(z.string()).optional(),
    "x5t#S256": z.string().optional(),
  })
  .strict();

export type Jwk = z.infer<typeof JwkSchema>;

/** Validate an untrusted value as a strict EC P-256 JWK, or return null. */
export function parseJwk(input: unknown): Jwk | null {
  const r = JwkSchema.safeParse(input);
  return r.success ? r.data : null;
}
