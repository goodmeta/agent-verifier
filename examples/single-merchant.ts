/**
 * Single-Merchant Verification (Self-Hosted, legacy policy model)
 *
 * Sign a payload as an ES256 JWS (AP2's *receipt* format), verify it, and check
 * its constraints — all locally, no hosted service. This uses the simple
 * legacy `IntentMandate` model; for REAL AP2 mandate verification (dSD-JWT
 * delegation chains), use the `ap2` namespace (`ap2.verifyChain`, …).
 *
 * Run: npm run demo
 */

import { generateKeyPair, exportJWK } from "jose";
import { signReceipt, verifyReceipt, checkConstraints, type IntentMandate } from "../src/index.js";

async function main() {
  console.log("\n=== Single-Merchant Verification (ES256 JWT) ===\n");

  // The user's signing key (in AP2 this is a JWK; here we generate an ES256 pair).
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const priv = await exportJWK(privateKey);
  const pub = await exportJWK(publicKey);

  // 1. User creates a mandate and signs the WHOLE thing as a compact JWS.
  const mandate: IntentMandate = {
    type: "intent-mandate",
    version: "0.1.0",
    id: crypto.randomUUID(),
    user: { id: "user-1" },
    agent: { id: "shopping-agent" },
    intent: "Buy coffee, up to $30 per order",
    constraints: { maxAmount: "3000", currency: "USDC", categories: ["coffee"], allowedMerchants: ["cafe-1"] },
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    budgetTotal: "10000",
    budgetSpent: "0",
  };
  const token = await signReceipt(mandate, priv);
  console.log(`Signed mandate (JWS): ${token.slice(0, 32)}...`);

  // 2. Merchant verifies the signature and gets the trusted payload back.
  const verified = await verifyReceipt<IntentMandate>(token, pub);
  console.log(`Signature valid: ${verified.valid}`);
  if (!verified.valid || !verified.payload) return;

  // 3. Check constraints — $22 coffee at the allowed merchant.
  const ok = checkConstraints(verified.payload, {
    amount: "2200",
    merchantId: "cafe-1",
    items: [{ id: "latte", name: "Latte", quantity: 1, unitPrice: "2200", currency: "USDC", category: "coffee" }],
  });
  console.log(`$22 coffee @ cafe-1: ${ok.valid ? "✅ APPROVED" : "❌ " + ok.error}`);

  // 4. $35 — over the per-transaction max.
  const denied = checkConstraints(verified.payload, {
    amount: "3500",
    merchantId: "cafe-1",
    items: [{ id: "x", name: "Big Latte", quantity: 1, unitPrice: "3500", currency: "USDC", category: "coffee" }],
  });
  console.log(`$35 order: ${denied.valid ? "✅ APPROVED" : "❌ " + denied.error}`);

  console.log("\nNote: stateless verification. Budget tracking across merchants");
  console.log("requires the hosted Verifier: verifier.goodmeta.co\n");
}

main().catch(console.error);
