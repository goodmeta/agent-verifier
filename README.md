# @goodmeta/agent-verifier

Implements the [Budget Authority Protocol](https://github.com/goodmeta/agent-payments-landscape/blob/main/specs/budget-authority-protocol.md). Can this agent spend $X on Y right now? One function call.

```ts
import { checkPolicy } from "@goodmeta/agent-verifier"

const result = checkPolicy(policy, {
  agentId: "agent-1",
  amount: 4500,
  idempotencyKey: "tx-1",
})
// → { approved: true, remaining: { budget: 15500 } }
// → { approved: false, reason: "BUDGET_EXCEEDED", detail: "$45 exceeds remaining $30" }
```

Or with the hosted verifier (cross-agent budget tracking):

```ts
import { VerifierClient } from "@goodmeta/agent-verifier"

const verifier = new VerifierClient({ apiKey: "gm_test_..." })
const { approved, verificationId } = await verifier.verify(mandate, {
  amount: "3000",
  idempotencyKey: "tx-1",
})
```

## Why

Agents need spending limits. Without them, a runaway agent generates unlimited charges. This library answers one question before every transaction:

**Is this agent authorized to spend this amount?**

- **Budget caps** — $200/month, $50 max per transaction
- **Scope restrictions** — allowed API codes, allowed customers, blocklists
- **Cross-agent tracking** — one budget across multiple services (hosted mode)
- **Rail-agnostic** — works with Stripe, x402, MPP, bank transfers, anything

## Install

```bash
npm install @goodmeta/agent-verifier
```

## Usage

### Policy-based verification

No crypto, no signatures. Define spending rules, check against them. Good for billing systems, MCP servers, internal tools.

```ts
import { checkPolicy, type SpendingPolicy } from "@goodmeta/agent-verifier"

const policy: SpendingPolicy = {
  agentId: "billing-agent",
  budgetTotal: 20_000, // $200/month
  budgetPeriod: "monthly",
  constraints: {
    maxPerEvent: 5_000, // $50 per event
    allowedCodes: ["api_calls", "compute"],
  },
}

// ✅ approved
checkPolicy(policy, {
  agentId: "billing-agent",
  amount: 4_500,
  idempotencyKey: "tx-1",
})
// → { approved: true, remaining: { budget: 15500, period: "monthly" } }

// ❌ over per-event limit
checkPolicy(policy, {
  agentId: "billing-agent",
  amount: 6_000,
  idempotencyKey: "tx-2",
})
// → { approved: false, reason: "AMOUNT_EXCEEDED", detail: "$60.00 exceeds per-event max $50.00" }

// ❌ code not allowed
checkPolicy(policy, {
  agentId: "billing-agent",
  amount: 3_000,
  metadata: { code: "storage" },
  idempotencyKey: "tx-3",
})
// → { approved: false, reason: "CODE_NOT_ALLOWED", detail: 'Code "storage" not in allowed list' }
```

### Real AP2 mandate verification (dSD-JWT)

[AP2](https://ap2-protocol.org/) mandates (Google, 60+ partners) are **not** plain signed JSON — they are **dSD-JWT delegation chains**: an issuer-signed SD-JWT root plus N KB-SD-JWT hops, each hop signed by the previous hop's `cnf.jwk`, hash-chained via `sd_hash`/`issuer_jwt_hash`, ES256/P-256. The `ap2` namespace verifies the whole chain and evaluates the mandate's constraints. It is **ported byte-exact from AP2's reference SDK** (pinned commit, 65 golden vectors) and is **stricter than AP2 on every trust decision** — see [`AP2-AUDIT.md`](./AP2-AUDIT.md).

```ts
import { ap2 } from "@goodmeta/agent-verifier"

// 1. Verify the delegation chain. Pass the root issuer key (or an x5c/kid
//    provider) and the expected audience + nonce — both REQUIRED (fail-closed).
const tokens = ap2.splitChain(compactChain)
const payloads = await ap2.verifyChain(tokens, rootIssuerJwk, {
  expectedAud: "merchant",
  expectedNonce: "nonce-1",
})
// signatures, cnf hop-chaining, sd_hash binding, typ rules, aud/nonce all
// verified — throws on any failure. payloads = [open, ...intermediate, closed]

// 2. Type the [open, closed] pair and evaluate constraints (budget, amount
//    range, allowed payees/instruments, line-items max-flow, …).
const chain = ap2.parsePaymentChain(payloads)
const violations = ap2.verifyPaymentChain(chain, {
  mandateContext: { total_amount: 0, total_uses: 0 },
})
if (violations.length) throw new Error(violations.join("; ")) // [] = authorized

// 3. Stable receipt reference (hash of the final SD-JWT in the chain).
const reference = ap2.receiptReference(compactChain)
```

For certificate-anchored roots, build a fail-closed `x5c`/`kid` provider (mandatory trusted roots, validity window, `CA:TRUE`, leaf P-256, anchor-to-root):

```ts
const provider = ap2.x5cOrKidProvider({ trustedRoots /* X509Certificate[] */ })
const payloads = await ap2.verifyChain(tokens, provider, { expectedAud, expectedNonce })
```

### Receipts (ES256 JWS)

A *Mandate Receipt* in AP2 is a Verifier-signed JWT (`iss`/`result`/`reference`). `signReceipt`/`verifyReceipt` are a plain compact ES256 JWS over the whole payload — the receipt mechanism. (They also back the simpler legacy `IntentMandate` self-hosted flow; see `examples/single-merchant.ts`.)

```ts
import { signReceipt, verifyReceipt } from "@goodmeta/agent-verifier"

const token = await signReceipt(receipt, verifierPrivateJwk)
const { valid, payload, error } = await verifyReceipt(token, verifierPublicJwk)
if (!valid) throw new Error(error)
```

### Hosted verifier

When one agent's budget spans multiple services — Mistral AND Groq AND CoreWeave — a shared verifier tracks the total spend. Self-hosted verification can't do this because each service only sees its own transactions.

```ts
import { VerifierClient } from "@goodmeta/agent-verifier"

const verifier = new VerifierClient({
  apiKey: "gm_test_...",
  baseUrl: "https://verifier.goodmeta.co",
})

// verify + place budget hold
const { approved, verificationId } = await verifier.verify(mandate, {
  amount: "3000",
  currency: "USDC",
  idempotencyKey: "order-123",
})

if (approved) {
  // settle via any payment rail
  const payment = await charge(/* stripe, x402, mpp, bank */)

  await verifier.settle(verificationId!, {
    success: payment.ok,
    transactionId: payment.id,
    rail: "card",
  })
}
```

## API

### Policy

| Function | Description |
| --- | --- |
| `checkPolicy(policy, request, currentSpend?)` | Check a spending request against policy constraints |

### AP2 dSD-JWT verifier (`ap2.*`)

| Function | Description |
| --- | --- |
| `ap2.splitChain(compact)` | Split a `~~`-joined dSD-JWT chain into parsed tokens |
| `ap2.verifyChain(tokens, keyOrProvider, opts)` | Verify the full delegation chain (signatures, cnf hop-chaining, binding, typ, terminal aud/nonce); returns per-hop payloads, throws on failure |
| `ap2.x5cOrKidProvider(opts)` | Build a fail-closed root-key provider from `x5c` certs or a `kid` lookup |
| `ap2.parsePaymentChain` / `ap2.verifyPaymentChain` | Type the `[open, closed]` payment pair; evaluate constraints + linkage (`[]` = ok) |
| `ap2.parseCheckoutChain` / `ap2.verifyCheckoutChain` | Same for checkout; self-computes `checkout_hash` from the embedded `checkout_jwt` |
| `ap2.checkPaymentConstraints` / `ap2.checkCheckoutConstraints` | Evaluate the 8 payment / 2 checkout constraints directly |
| `ap2.receiptReference(compact)` | Stable receipt reference (`sd_hash` of the final SD-JWT) |
| `ap2.*Schema` / types | zod schemas + types for the snake_case AP2 mandates |

### Receipts (ES256 JWS)

| Function | Description |
| --- | --- |
| `signReceipt(payload, privateJwk)` | Sign a payload as a compact ES256 JWS (AP2 receipt format) |
| `verifyReceipt(token, publicJwk)` | Verify the JWS signature; returns the trusted payload |
| `checkConstraints(mandate, tx)` | (Legacy) check budget/merchant/category/temporal constraints on an `IntentMandate` |

### Hosted verifier client

| Method | Description |
| --- | --- |
| `verifier.verify(mandate, tx)` | Verify with full mandate object + place budget hold |
| `verifier.verifyById(mandateId, tx)` | Verify by ID (agent passes ID, verifier has mandate on file) |
| `verifier.createBudget(opts)` | Create a budget envelope — no signature; the API key is the trust anchor |
| `verifier.settle(id, result)` | Confirm payment (debit budget) or release the hold |
| `verifier.release(id)` | Return a pre-commit hold to the budget (before settlement) |
| `verifier.refund(id, cents, key)` | Reverse a settled payment, full or partial (idempotent) |
| `verifier.getMandateState(id)` | Query budget, tx count, and history |

Calls apply a timeout and throw a typed `VerifierError` (with HTTP `status` + `body`) on transport, auth, or server failures; a denied verification is returned with `approved: false`, not thrown.

## Related

- [AP2](https://ap2-protocol.org/) — Agent payment authorization by Google (60+ partners)
- [MPP](https://mpp.dev/) — Machine Payments Protocol by Tempo + Stripe
- [x402](https://www.x402.org/) — HTTP-native agent payments by Coinbase

## License

MIT — [Good Meta](https://goodmeta.co)
