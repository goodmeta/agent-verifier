/**
 * Line-items constraint via bipartite max-flow — line-for-line port of AP2's
 * `sdk/max_flow_helper.py` (commit e1ea56d), Dinic variant (AP2's default).
 *
 * A checkout satisfies a `checkout.line_items` constraint when every cart item
 * can be assigned to a requirement slot that accepts it (an item matches if its
 * id is in the requirement's `acceptable_items`, or the requirement is a
 * wildcard — empty `acceptable_items`), each requirement filled up to its
 * `quantity`, and no cart unit assigned twice. A fast greedy pass resolves
 * degree-1 items; the remaining ambiguous ("complex") items go through max-flow.
 * Violation strings match AP2 byte-for-byte.
 */

const INF = 1e15;

export interface CartLineItem {
  item: { id: string };
  quantity: number;
}
export interface LineItemRequirement {
  acceptable_items: { id: string }[];
  quantity: number;
}

type Graph = Map<number, number>[];

export function evaluateLineItemsMaxFlow(checkoutItems: CartLineItem[], requirements: LineItemRequirement[]): string[] {
  const cartQty = new Map<string, number>();
  for (const li of checkoutItems) {
    const sku = li.item.id;
    cartQty.set(sku, (cartQty.get(sku) ?? 0) + li.quantity);
  }
  const skuList = [...cartQty.keys()];

  const reqAcceptable: Set<string>[] = requirements.map((req) =>
    req.acceptable_items.length ? new Set(req.acceptable_items.map((ai) => ai.id)) : new Set<string>(),
  );
  const reqIsWildcard: boolean[] = requirements.map((req) => req.acceptable_items.length === 0);

  const violations: string[] = [];
  const hasWildcard = reqIsWildcard.some(Boolean);
  const allAcceptable = new Set<string>();
  if (!hasWildcard) for (const acc of reqAcceptable) for (const x of acc) allAcceptable.add(x);

  for (const [sku, qty] of cartQty) {
    if (qty <= 0) continue;
    if (!hasWildcard && !allAcceptable.has(sku)) {
      violations.push(`Item ${sku} not in any requirement's acceptable items`);
    }
  }
  if (violations.length) return violations;

  // Greedy elimination of degree-1 matches.
  const reqRemaining = requirements.map((req) => req.quantity);
  const complexSkus: string[] = [];
  const unassigned: string[] = [];

  for (const sku of skuList) {
    const qty = cartQty.get(sku)!;
    if (qty <= 0) continue;
    let matchIdx = -1;
    let isComplex = false;
    for (let j = 0; j < requirements.length; j++) {
      if (reqIsWildcard[j] || reqAcceptable[j].has(sku)) {
        if (matchIdx === -1) matchIdx = j;
        else {
          isComplex = true;
          break;
        }
      }
    }
    if (matchIdx !== -1 && !isComplex) {
      const assigned = Math.min(qty, reqRemaining[matchIdx]);
      reqRemaining[matchIdx] -= assigned;
      const leftover = qty - assigned;
      if (leftover > 0) unassigned.push(`${sku} (${leftover})`);
    } else {
      complexSkus.push(sku);
    }
  }

  if (complexSkus.length) {
    const { maxFlow, residual } = lineItemsMaxFlow(complexSkus, cartQty, requirements, reqAcceptable, reqIsWildcard, reqRemaining);
    const totalComplexCart = complexSkus.reduce((s, sku) => s + cartQty.get(sku)!, 0);
    if (maxFlow < totalComplexCart) {
      const source = 0;
      const skuOffset = 1;
      complexSkus.forEach((sku, i) => {
        const remaining = residual[source].get(skuOffset + i) ?? 0;
        if (remaining > 0) unassigned.push(`${sku} (${remaining})`);
      });
    }
  }

  if (unassigned.length) {
    violations.push(
      `Cannot satisfy line item constraints: ${unassigned.join(", ")} could not be assigned to any requirement slot`,
    );
  }
  return violations;
}

function lineItemsMaxFlow(
  skuList: string[],
  cartQty: Map<string, number>,
  requirements: LineItemRequirement[],
  reqAcceptable: Set<string>[],
  reqIsWildcard: boolean[],
  reqRemaining: number[],
): { maxFlow: number; residual: Graph } {
  const sCount = skuList.length;
  const rCount = requirements.length;
  const n = 1 + sCount + rCount + 1;
  const source = 0;
  const sink = n - 1;
  const skuOffset = 1;
  const reqOffset = skuOffset + sCount;
  const graph: Graph = Array.from({ length: n }, () => new Map<number, number>());

  // 1. source -> SKUs
  skuList.forEach((sku, i) => {
    graph[source].set(skuOffset + i, cartQty.get(sku)!);
    graph[skuOffset + i].set(source, 0);
  });
  // 2. SKUs -> requirements
  skuList.forEach((sku, i) => {
    for (let j = 0; j < requirements.length; j++) {
      if (reqIsWildcard[j] || reqAcceptable[j].has(sku)) {
        graph[skuOffset + i].set(reqOffset + j, INF);
        graph[reqOffset + j].set(skuOffset + i, 0);
      }
    }
  });
  // 3. requirements -> sink
  for (let j = 0; j < requirements.length; j++) {
    graph[reqOffset + j].set(sink, reqRemaining[j]);
    graph[sink].set(reqOffset + j, 0);
  }

  return { maxFlow: dinic(graph, source, sink, n), residual: graph };
}

function dinic(graph: Graph, source: number, sink: number, n: number): number {
  const adjNodes = graph.map((m) => [...m.keys()]);

  function bfsLevel(): number[] | null {
    const level = new Array<number>(n).fill(-1);
    level[source] = 0;
    const q: number[] = [source];
    let head = 0;
    while (head < q.length) {
      const u = q[head++];
      for (const v of adjNodes[u]) {
        if (level[v] === -1 && (graph[u].get(v) ?? 0) > 0) {
          level[v] = level[u] + 1;
          q.push(v);
        }
      }
    }
    return level[sink] !== -1 ? level : null;
  }

  function dfsBlock(u: number, pushed: number, level: number[], it: number[]): number {
    if (u === sink || pushed === 0) return pushed;
    let totalPushed = 0;
    while (it[u] < adjNodes[u].length) {
      const v = adjNodes[u][it[u]];
      const cap = graph[u].get(v) ?? 0;
      if (level[v] === level[u] + 1 && cap > 0) {
        const d = dfsBlock(v, Math.min(pushed, cap), level, it);
        if (d > 0) {
          graph[u].set(v, (graph[u].get(v) ?? 0) - d);
          graph[v].set(u, (graph[v].get(u) ?? 0) + d);
          totalPushed += d;
          pushed -= d;
          if (pushed === 0) break;
        }
      }
      it[u]++;
    }
    return totalPushed;
  }

  let total = 0;
  for (;;) {
    const level = bfsLevel();
    if (level === null) break;
    const it = new Array<number>(n).fill(0);
    for (;;) {
      const f = dfsBlock(source, INF, level, it);
      if (f === 0) break;
      total += f;
    }
  }
  return total;
}
