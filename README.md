# @goodmeta/agent-verifier

Agent spending verification — can this agent spend $X on Y right now?

Works with AP2 mandates (cryptographic), spending policies (configured), or the hosted Verifier API (cross-agent state tracking).

## Three Modes

### 1. AP2 Mandate Verification (Self-Hosted)

For agents carrying [AP2](https://ap2-protocol.org/) cryptographic mandates. Verify signatures and check constraints locally.

```typescript
import { verifyIntentSignature, checkConstraints } from "@goodmeta/agent-verifier";

const sig = await verifyIntentSignature(mandate);
if (!sig.valid) throw new Error(sig.error);

const check = checkConstraints(mandate, {
  amount: "3000",
  items: [{ id: "api-credits", category: "compute", ... }],
});
if (!check.valid) throw new Error(check.error);
```

### 2. Policy-Based Verification (Lago, Custom Billing)

For systems that don't use AP2 mandates. Define spending rules via config — budget caps, allowed codes, customer restrictions.

```typescript
import { checkPolicy, type SpendingPolicy } from "@goodmeta/agent-verifier";

const policy: SpendingPolicy = {
  agentId: "billing-agent-001",
  budgetTotal: 20000,       // $200
  budgetPeriod: "monthly",
  constraints: {
    maxPerEvent: 5000,      // $50 max per event
    allowedCodes: ["api_calls", "compute"],
    allowedCustomers: ["cust_mistral", "cust_groq"],
  },
};

const result = checkPolicy(policy, {
  agentId: "billing-agent-001",
  amount: 4500,
  metadata: { code: "api_calls", customer: "cust_mistral" },
  idempotencyKey: "evt-001",
}, currentSpend);

if (!result.approved) {
  console.log(result.detail); // "$45.00 exceeds remaining budget $30.00"
}
```

### 3. Hosted Verifier (Cross-Agent State)

For cross-agent budget tracking — one agent's spending tracked across multiple services. Budget can't be overspent even when hitting different merchants/APIs simultaneously.

```typescript
import { VerifierClient } from "@goodmeta/agent-verifier";

const verifier = new VerifierClient({
  apiKey: "gm_live_...",
  baseUrl: "https://verifier.goodmeta.co",
});

const result = await verifier.verify(mandate, {
  amount: "3000",
  currency: "USDC",
  idempotencyKey: "order-123",
});

if (result.approved) {
  // Process payment via any rail (Stripe, x402, MPP, bank)
  const payment = await processPayment(...);
  await verifier.settle(result.verificationId, {
    success: payment.success,
    transactionId: payment.id,
    rail: "card",
  });
}
```

## API

### AP2 Mandate Verification

| Function | What |
|----------|------|
| `verifyIntentSignature(mandate)` | Verify EIP-712 signature on Intent Mandate |
| `verifyCartSignature(mandate)` | Verify EIP-712 signature on Cart Mandate |
| `checkConstraints(mandate, tx)` | Check budget, merchant, category, temporal constraints |

### AP2 Signing

| Function | What |
|----------|------|
| `signIntentMandate(mandate, account)` | User signs spending authority |
| `signCartMandate(mandate, account)` | Merchant signs price commitment |
| `approveCartMandate(mandate, account)` | User approves specific purchase |

### Policy-Based Verification

| Function | What |
|----------|------|
| `checkPolicy(policy, request, currentSpend)` | Check spending request against policy constraints |

### Hosted Verifier Client

| Method | What |
|--------|------|
| `verifier.verify(mandate, tx)` | Verify + hold budget (cross-agent safe) |
| `verifier.settle(verificationId, result)` | Confirm or release payment |
| `verifier.getMandateState(mandateId)` | Query budget, history |

## Quick Start

```bash
npm install @goodmeta/agent-verifier
npm run demo  # single-merchant verification example
```

## Further Reading

- [AP2 Protocol](https://ap2-protocol.org/) — Google's agent payment authorization
- [MPP](https://mpp.dev/) — Machine Payments Protocol (Tempo/Stripe)
- [x402](https://www.x402.org/) — HTTP-native agent payments (Coinbase)
- [Good Meta](https://goodmeta.co) — agent spending verification infrastructure

## License

MIT
