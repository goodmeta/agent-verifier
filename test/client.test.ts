import { test } from "node:test";
import assert from "node:assert/strict";
import { VerifierClient, VerifierError } from "../src/index.js";

// A fetch stub: respond from a function, no network.
function stub(responder: (url: string, init: any) => Response | Promise<Response>): typeof fetch {
  return (async (url: unknown, init: unknown) => responder(String(url), init)) as unknown as typeof fetch;
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const mandate = {
  type: "intent-mandate", version: "0.1.0", id: "m", user: { id: "0x1" }, agent: { id: "a" },
  intent: "", constraints: { maxAmount: "5000", currency: "USDC" },
  validFrom: "x", validUntil: "y", budgetTotal: "10000", budgetSpent: "0",
} as never;
const tx = { amount: "3000", currency: "USDC", idempotencyKey: "k" };

test("verify returns the approved body on 200", async () => {
  const c = new VerifierClient({ apiKey: "gm_test_x", fetch: stub(() => json({ approved: true, verificationId: "v1" })) });
  const r = await c.verify(mandate, tx);
  assert.equal(r.approved, true);
  assert.equal(r.verificationId, "v1");
});

test("verify returns a denial body on 403 (NOT thrown)", async () => {
  const c = new VerifierClient({ apiKey: "gm_test_x", fetch: stub(() => json({ approved: false, reason: "BUDGET_EXCEEDED" }, 403)) });
  const r = await c.verify(mandate, tx);
  assert.equal(r.approved, false);
  assert.equal(r.reason, "BUDGET_EXCEEDED");
});

test("verify throws VerifierError on 401 (auth)", async () => {
  const c = new VerifierClient({ apiKey: "bad", fetch: stub(() => json({ error: "Invalid API key" }, 401)) });
  await assert.rejects(() => c.verify(mandate, tx), (e: unknown) => e instanceof VerifierError && e.status === 401);
});

test("settle throws VerifierError on 404 with the body attached", async () => {
  const c = new VerifierClient({ apiKey: "gm_test_x", fetch: stub(() => json({ error: "VERIFICATION_NOT_FOUND" }, 404)) });
  await assert.rejects(
    () => c.settle("nope", { success: true }),
    (e: unknown) => e instanceof VerifierError && e.status === 404 && (e.body as { error: string }).error === "VERIFICATION_NOT_FOUND",
  );
});

test("throws VerifierError on a non-JSON body", async () => {
  const c = new VerifierClient({ apiKey: "gm_test_x", fetch: stub(() => new Response("<html>502 Bad Gateway</html>", { status: 502 })) });
  await assert.rejects(() => c.settle("v", { success: true }), (e: unknown) => e instanceof VerifierError && /non-JSON/.test((e as Error).message));
});

test("throws VerifierError (timeout) when a request exceeds timeoutMs", async () => {
  const c = new VerifierClient({
    apiKey: "gm_test_x",
    timeoutMs: 20,
    fetch: stub((_url, init) => new Promise<Response>((_res, rej) => {
      init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })),
  });
  await assert.rejects(() => c.verify(mandate, tx), (e: unknown) => e instanceof VerifierError && /timed out/.test((e as Error).message));
});

test("sends the bearer token", async () => {
  let seenAuth = "";
  const c = new VerifierClient({ apiKey: "gm_test_secret", fetch: stub((_url, init) => { seenAuth = init.headers.Authorization; return json({ approved: true }); }) });
  await c.verify(mandate, tx);
  assert.equal(seenAuth, "Bearer gm_test_secret");
});

test("missing apiKey throws at construction", () => {
  assert.throws(() => new VerifierClient({ apiKey: "" }), (e: unknown) => e instanceof VerifierError);
});
