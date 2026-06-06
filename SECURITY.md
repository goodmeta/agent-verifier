# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub's **"Report a vulnerability"**
button on this repository's **Security** tab (private vulnerability reporting).
Do not open a public issue for security reports. We aim to acknowledge within
72 hours.

## Scope

`@goodmeta/agent-verifier` performs spending-authorization checks, so the
highest-value targets are:

- **Money parsing** — every amount must pass the `Cents` validator (positive,
  safe-integer cents). Report any input that bypasses it or is mis-parsed.
- **Signature verification** — EIP-712 verification uses `viem`. Report any
  mandate that verifies with an invalid, mismatched, or replayed signature.
- **Constraint / policy bypass** — report any transaction approved despite
  violating a budget, per-event cap, allowlist/blocklist, category, or expiry.

The hosted `VerifierClient` only forwards requests to the Verifier API; server-
side issues should be reported against the hosted service.

## Supported versions

The latest published minor version receives security fixes.
