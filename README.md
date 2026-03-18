# @goodmeta/ap2-verifier

AP2 mandate verification — signature verification, constraint checking, and Verifier API client.

## What is AP2?

[AP2](https://ap2-protocol.org/) (Agent Payments Protocol) is Google's protocol for AI agent payment authorization. Agents carry cryptographically signed mandates that define what they're allowed to spend.

This library verifies those mandates.

## Two Modes

### 1. Self-Hosted (Stateless)

Verify mandate signatures and check constraints locally. No external dependencies. Good for single-merchant setups.

```typescript
import { verifyIntentSignature, checkConstraints } from "@goodmeta/ap2-verifier";

// Verify the mandate is real (signature check)
const sig = await verifyIntentSignature(mandate);
if (!sig.valid) throw new Error(sig.error);

// Check constraints (budget, merchant, category)
const check = checkConstraints(mandate, {
  amount: "3000",
  items: [{ id: "api-credits", category: "compute", ... }],
});
if (!check.valid) throw new Error(check.error);

// Process payment...
```

**Limitation:** Stateless verification can't track budget across merchants. If one agent's mandate is used at Merchant A and Merchant B, each merchant only sees their own transactions. Overspend across merchants is possible.

### 2. Hosted Verifier (Cross-Merchant)

For cross-merchant budget tracking, use the hosted Verifier API. Budget is tracked centrally — no overspend possible, even across multiple merchants.

```typescript
import { VerifierClient } from "@goodmeta/ap2-verifier";

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
  // Process payment via your payment rail (Stripe, x402, bank)
  const payment = await processPayment(...);

  // Settle — permanently debits the mandate budget
  await verifier.settle(result.verificationId, {
    success: payment.success,
    transactionId: payment.id,
    rail: "card",
  });
}
```

## API

### Verification

| Function | What |
|----------|------|
| `verifyIntentSignature(mandate)` | Verify EIP-712 signature on Intent Mandate |
| `verifyCartSignature(mandate)` | Verify EIP-712 signature on Cart Mandate |
| `checkConstraints(mandate, tx)` | Check budget, merchant, category, temporal constraints |

### Signing

| Function | What |
|----------|------|
| `signIntentMandate(mandate, account)` | User signs spending authority |
| `signCartMandate(mandate, account)` | Merchant signs price commitment |
| `approveCartMandate(mandate, account)` | User approves specific purchase |

### Hosted Verifier Client

| Method | What |
|--------|------|
| `verifier.verify(mandate, tx)` | Verify + hold budget (cross-merchant safe) |
| `verifier.settle(verificationId, result)` | Confirm or release payment |
| `verifier.getMandateState(mandateId)` | Query budget, history |

## Quick Start

```bash
npm install @goodmeta/ap2-verifier
npm run demo  # single-merchant verification example
```

## Further Reading

- [AP2 Protocol Specification](https://ap2-protocol.org/specification/)
- [AP2 GitHub](https://github.com/google-agentic-commerce/AP2)
- [Good Meta](https://goodmeta.co) — agentic commerce infrastructure

## License

MIT
