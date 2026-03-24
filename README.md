# @goodmeta/agent-verifier

Can this agent spend $X on Y right now? One function call.

```typescript
import { checkPolicy } from "@goodmeta/agent-verifier";

const result = checkPolicy(policy, { agentId: "agent-1", amount: 4500, idempotencyKey: "tx-1" });
// → { approved: true, remaining: { budget: 15500 } }
// → { approved: false, reason: "BUDGET_EXCEEDED", detail: "$45.00 exceeds remaining $30.00" }
```

```typescript
import { VerifierClient } from "@goodmeta/agent-verifier";

const v = new VerifierClient({ apiKey: "gm_live_..." });
const { approved, verificationId } = await v.verify(mandate, { amount: "3000", idempotencyKey: "tx-1" });
```

---

## What This Does

Agents need spending limits. Without them, a runaway agent can generate unlimited charges. This library answers one question before every transaction: **is this agent authorized to spend this amount?**

- **Budget caps** — $200/month, $50 max per transaction
- **Scope restrictions** — only these API codes, only these customers
- **Cross-agent tracking** — one budget across multiple services (hosted mode)
- **Works with any payment rail** — Stripe, x402, MPP, bank, doesn't matter

## Install

```bash
npm install @goodmeta/agent-verifier
```

## Three Verification Modes

### 1. Policy-Based (simplest — no crypto, no signatures)

Define spending rules, check against them. Good for billing systems, MCP servers, internal tools.

```typescript
import { checkPolicy, type SpendingPolicy } from "@goodmeta/agent-verifier";

const policy: SpendingPolicy = {
  agentId: "billing-agent",
  budgetTotal: 20000,       // $200/month
  budgetPeriod: "monthly",
  constraints: {
    maxPerEvent: 5000,      // $50 max per event
    allowedCodes: ["api_calls", "compute"],
  },
};

checkPolicy(policy, { agentId: "billing-agent", amount: 4500, idempotencyKey: "tx-1" });
// ✅ { approved: true, remaining: { budget: 15500, period: "monthly" } }

checkPolicy(policy, { agentId: "billing-agent", amount: 6000, idempotencyKey: "tx-2" });
// ❌ { approved: false, reason: "AMOUNT_EXCEEDED", detail: "$60.00 exceeds per-event max $50.00" }

checkPolicy(policy, { agentId: "billing-agent", amount: 3000, metadata: { code: "storage" }, idempotencyKey: "tx-3" });
// ❌ { approved: false, reason: "CODE_NOT_ALLOWED", detail: 'Code "storage" not in allowed list' }
```

### 2. AP2 Mandate Verification (cryptographic — Google's protocol)

For agents carrying [AP2](https://ap2-protocol.org/) signed mandates. Verifies EIP-712 signatures and checks constraints.

```typescript
import { verifyIntentSignature, checkConstraints } from "@goodmeta/agent-verifier";

// Verify the mandate is cryptographically real
const sig = await verifyIntentSignature(mandate);

// Check spending constraints
const check = checkConstraints(mandate, { amount: "3000", merchantId: "merchant-1" });
```

### 3. Hosted Verifier (cross-agent budget tracking)

When one agent's budget spans multiple services — Mistral AND Groq AND CoreWeave — a shared verifier tracks the total. Self-hosted verification can't do this.

```typescript
import { VerifierClient } from "@goodmeta/agent-verifier";

const verifier = new VerifierClient({
  apiKey: "gm_live_...",
  baseUrl: "https://verifier.goodmeta.co",
});

// Verify + place budget hold
const result = await verifier.verify(mandate, {
  amount: "3000",
  currency: "USDC",
  idempotencyKey: "order-123",
});

if (result.approved) {
  const payment = await processPayment(/* any rail */);
  await verifier.settle(result.verificationId, {
    success: payment.success,
    transactionId: payment.id,
    rail: "card",
  });
}
```

## API Reference

### Policy-Based

| Function | What |
|----------|------|
| `checkPolicy(policy, request, currentSpend?)` | Check spending request against policy constraints |

### AP2 Mandates

| Function | What |
|----------|------|
| `verifyIntentSignature(mandate)` | Verify EIP-712 signature |
| `verifyCartSignature(mandate)` | Verify cart mandate signature |
| `checkConstraints(mandate, tx)` | Check budget, merchant, category, temporal |
| `signIntentMandate(mandate, account)` | Sign spending authority |
| `signCartMandate(mandate, account)` | Sign price commitment |
| `approveCartMandate(mandate, account)` | Approve specific purchase |

### Hosted Verifier Client

| Method | What |
|--------|------|
| `verifier.verify(mandate, tx)` | Verify + hold budget (cross-agent safe) |
| `verifier.settle(id, result)` | Confirm or release payment |
| `verifier.getMandateState(id)` | Query budget + history |

## Further Reading

- [AP2](https://ap2-protocol.org/) — Google's agent payment authorization (60+ partners)
- [MPP](https://mpp.dev/) — Machine Payments Protocol (Tempo/Stripe)
- [x402](https://www.x402.org/) — HTTP-native agent payments (Coinbase)

## License

MIT — [Good Meta](https://goodmeta.co)
