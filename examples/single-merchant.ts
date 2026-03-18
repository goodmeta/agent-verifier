/**
 * Single-Merchant Verification (Self-Hosted)
 *
 * Shows how to verify mandates locally without the hosted Verifier.
 * Good for: single-merchant setups where cross-merchant tracking isn't needed.
 *
 * Run: npm run demo
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  verifyIntentSignature,
  checkConstraints,
  signIntentMandate,
  type IntentMandate,
} from "../src/index.js";

async function main() {
  console.log("\n=== Single-Merchant Verification ===\n");

  const userAccount = privateKeyToAccount(generatePrivateKey());

  // 1. User creates and signs a mandate
  const mandate: IntentMandate = {
    type: "intent-mandate",
    version: "0.1.0",
    id: crypto.randomUUID(),
    user: { id: userAccount.address },
    agent: { id: "shopping-agent" },
    intent: "Buy coffee, up to $30 per order",
    constraints: {
      maxAmount: "3000",
      currency: "USDC",
      categories: ["coffee"],
    },
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    budgetTotal: "10000",
    budgetSpent: "0",
  };

  mandate.userSignature = await signIntentMandate(mandate, userAccount);
  console.log(`Mandate signed: ${mandate.id.slice(0, 8)}...`);

  // 2. Verify signature
  const sigResult = await verifyIntentSignature(mandate);
  console.log(`Signature valid: ${sigResult.valid}`);

  // 3. Check constraints — $22 coffee order
  const ok = checkConstraints(mandate, {
    amount: "2200",
    items: [{ id: "latte", name: "Latte", quantity: 1, unitPrice: "2200", currency: "USDC", category: "coffee" }],
  });
  console.log(`$22 coffee: ${ok.valid ? "✅ APPROVED" : "❌ " + ok.error}`);

  // 4. Check constraints — $35 (over per-tx max)
  const denied = checkConstraints(mandate, { amount: "3500" });
  console.log(`$35 order: ${denied.valid ? "✅ APPROVED" : "❌ " + denied.error}`);

  // 5. Check constraints — wrong category
  const wrongCat = checkConstraints(mandate, {
    amount: "1500",
    items: [{ id: "book", name: "Book", quantity: 1, unitPrice: "1500", currency: "USDC", category: "books" }],
  });
  console.log(`$15 book: ${wrongCat.valid ? "✅ APPROVED" : "❌ " + wrongCat.error}`);

  console.log("\nNote: This is stateless verification. Budget tracking across");
  console.log("merchants requires the hosted Verifier: verifier.goodmeta.co\n");
}

main().catch(console.error);
