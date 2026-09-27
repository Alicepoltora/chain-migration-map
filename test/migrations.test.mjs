import test from "node:test";
import assert from "node:assert/strict";
import { inferMigrations } from "../lib/migrations.mjs";

test("infers a directional migration from matching balance deltas", () => {
  const rows = [
    { date: "2026-09-01", chain: "ethereum", token_symbol: "USDC", value_usd: 1_000_000, balance: 1_000_000, holders_count: 20 },
    { date: "2026-09-08", chain: "ethereum", token_symbol: "USDC", value_usd: 500_000, balance: 500_000, holders_count: 18 },
    { date: "2026-09-01", chain: "base", token_symbol: "USDC", value_usd: 200_000, balance: 200_000, holders_count: 10 },
    { date: "2026-09-08", chain: "base", token_symbol: "USDC", value_usd: 650_000, balance: 650_000, holders_count: 19 }
  ];
  const result = inferMigrations(rows);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].from, "ethereum");
  assert.equal(result.routes[0].to, "base");
  assert.equal(result.routes[0].valueUsd, 450_000);
  assert.equal(result.nodes.find((node) => node.id === "base").netFlowUsd, 450_000);
});

test("does not invent routes from a single snapshot", () => {
  const result = inferMigrations([{ date: "2026-09-01", chain: "ethereum", token_symbol: "ETH", value_usd: 1_000_000 }]);
  assert.deepEqual(result.routes, []);
});
