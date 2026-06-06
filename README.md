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

### AP2 mandate verification

For agents carrying [AP2](https://ap2-protocol.org/)-style mandates (Google, 60+ partners). A mandate is signed as a compact **ES256 JWS over the whole mandate** — the same mechanism AP2 uses — so verifying it both proves authenticity and hands back the trusted mandate. Then check its constraints.

```ts
import { signMandate, verifyMandate, checkConstraints } from "@goodmeta/agent-verifier"

// user signs the WHOLE mandate (ES256, JWK key) → a compact JWS token
const token = await signMandate(mandate, userPrivateJwk)

// merchant verifies the signature and gets the trusted mandate back
const { valid, mandate: verified, error } = await verifyMandate(token, userPublicJwk)
if (!valid) throw new Error(error)

// check spending constraints on the verified mandate
const check = checkConstraints(verified, { amount: "3000", merchantId: "merchant-1" })
if (!check.valid) throw new Error(check.error)
```

Because the entire mandate is under the signature, scope fields (allowlist, categories, validity window) can't be altered without breaking it.

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

### AP2 mandates (ES256 JWS — matches AP2)

| Function | Description |
| --- | --- |
| `signMandate(mandate, privateJwk)` | Sign the whole mandate as a compact ES256 JWS (returns a token) |
| `verifyMandate(token, publicJwk)` | Verify the JWS signature; returns the trusted mandate payload |
| `checkConstraints(mandate, tx)` | Check budget, merchant, category, and temporal constraints |

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
