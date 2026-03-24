# @goodmeta/agent-verifier

Can this agent spend $X on Y right now? One function call.

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

const verifier = new VerifierClient({ apiKey: "gm_live_..." })
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

For agents carrying [AP2](https://ap2-protocol.org/) cryptographic mandates (Google, 60+ partners). Verifies EIP-712 signatures and checks constraints.

```ts
import {
  verifyIntentSignature,
  checkConstraints,
} from "@goodmeta/agent-verifier"

// verify the mandate signature is real
const sig = await verifyIntentSignature(mandate)
if (!sig.valid) throw new Error(sig.error)

// check spending constraints
const check = checkConstraints(mandate, {
  amount: "3000",
  merchantId: "merchant-1",
})
if (!check.valid) throw new Error(check.error)
```

### Hosted verifier

When one agent's budget spans multiple services — Mistral AND Groq AND CoreWeave — a shared verifier tracks the total spend. Self-hosted verification can't do this because each service only sees its own transactions.

```ts
import { VerifierClient } from "@goodmeta/agent-verifier"

const verifier = new VerifierClient({
  apiKey: "gm_live_...",
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

### AP2 mandates

| Function | Description |
| --- | --- |
| `verifyIntentSignature(mandate)` | Verify EIP-712 signature on an Intent Mandate |
| `verifyCartSignature(mandate)` | Verify EIP-712 signature on a Cart Mandate |
| `checkConstraints(mandate, tx)` | Check budget, merchant, category, and temporal constraints |
| `signIntentMandate(mandate, account)` | User signs autonomous spending authority |
| `signCartMandate(mandate, account)` | Merchant signs price commitment |
| `approveCartMandate(mandate, account)` | User approves a specific purchase |

### Hosted verifier client

| Method | Description |
| --- | --- |
| `verifier.verify(mandate, tx)` | Verify + place budget hold (cross-agent safe) |
| `verifier.settle(id, result)` | Confirm payment or release hold |
| `verifier.getMandateState(id)` | Query budget, tx count, and history |

## Related

- [AP2](https://ap2-protocol.org/) — Agent payment authorization by Google (60+ partners)
- [MPP](https://mpp.dev/) — Machine Payments Protocol by Tempo + Stripe
- [x402](https://www.x402.org/) — HTTP-native agent payments by Coinbase

## License

MIT — [Good Meta](https://goodmeta.co)
