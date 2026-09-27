import { chainMeta } from "./migrations.mjs";

const flow = (id, from, to, valueUsd, confidence, assets, change, wallets) => ({
  id, from, to, valueUsd, confidence, assets, change, wallets,
  evidence: assets.length,
  sourceDeltaUsd: -Math.round(valueUsd * 1.08),
  destinationDeltaUsd: Math.round(valueUsd),
  bridgeEvidence: confidence >= 85 ? "Strong" : confidence >= 72 ? "Moderate" : "Directional"
});

export function demoDataset(window = "7d") {
  const multiplier = window === "5m" ? 0.018 : window === "1h" ? 0.09 : window === "24h" ? 0.24 : window === "30d" ? 2.85 : 1;
  const routes = [
    flow("eth-base", "ethereum", "base", 18_420_000, 91, [{ symbol: "USDC", valueUsd: 9_780_000 }, { symbol: "ETH", valueUsd: 5_140_000 }, { symbol: "AERO", valueUsd: 3_500_000 }], 38.2, 164),
    flow("sol-eth", "solana", "ethereum", 11_760_000, 78, [{ symbol: "USDC", valueUsd: 6_810_000 }, { symbol: "SOL", valueUsd: 4_950_000 }], -12.4, 89),
    flow("base-arc", "base", "arc", 8_640_000, 86, [{ symbol: "USDC", valueUsd: 5_900_000 }, { symbol: "ETH", valueUsd: 2_740_000 }], 62.8, 71),
    flow("bnb-monad", "bnb", "monad", 6_280_000, 73, [{ symbol: "USDT", valueUsd: 4_020_000 }, { symbol: "BNB", valueUsd: 2_260_000 }], 24.1, 53),
    flow("eth-sol", "ethereum", "solana", 4_910_000, 69, [{ symbol: "USDC", valueUsd: 2_920_000 }, { symbol: "ETH", valueUsd: 1_990_000 }], 8.7, 42),
    flow("base-sol", "base", "solana", 3_740_000, 65, [{ symbol: "USDC", valueUsd: 2_410_000 }, { symbol: "cbBTC", valueUsd: 1_330_000 }], 17.5, 31)
  ].map((route) => ({
    ...route,
    valueUsd: Math.round(route.valueUsd * multiplier),
    sourceDeltaUsd: Math.round(route.sourceDeltaUsd * multiplier),
    destinationDeltaUsd: Math.round(route.destinationDeltaUsd * multiplier),
    assets: route.assets.map((asset) => ({ ...asset, valueUsd: Math.round(asset.valueUsd * multiplier) }))
  }));

  const totals = new Map();
  for (const route of routes) {
    totals.set(route.from, (totals.get(route.from) || 0) - route.valueUsd);
    totals.set(route.to, (totals.get(route.to) || 0) + route.valueUsd);
  }
  const balances = { ethereum: 612_000_000, base: 184_000_000, solana: 328_000_000, bnb: 143_000_000, arc: 41_000_000, monad: 76_000_000 };
  const nodes = Object.keys(balances).map((id) => ({ id, ...chainMeta(id), balanceUsd: balances[id], netFlowUsd: totals.get(id) || 0 }));

  const pulse = [42, 47, 45, 53, 49, 62, 58, 66, 72, 68, 81, 77, 86, 84, 91, 88, 94, 89, 96, 100, 97, 104, 111, 108];
  return {
    mode: "demo",
    label: "DEMO DATA",
    window,
    generatedAt: new Date().toISOString(),
    from: window === "5m" ? "Last 5 minutes (normalized)" : window === "1h" ? "Last 1 hour" : window === "24h" ? "Last 24 hours" : window === "30d" ? "Last 30 days" : "Last 7 days",
    to: "Now",
    nodes,
    routes,
    tokens: routes.flatMap((route) => route.assets.map((asset) => ({ chain: route.to, symbol: asset.symbol, tokenAddress: null, netFlowUsd: asset.valueUsd, marketCapUsd: 0, traderCount: route.wallets || 0, sectors: [] }))).slice(0, 80),
    pulse,
    summary: {
      totalMovedUsd: routes.reduce((sum, route) => sum + route.valueUsd, 0),
      activeWallets: Math.round(312 * multiplier + 96),
      dominantRoute: "Ethereum → Base",
      emergingChain: "Arc"
    }
  };
}
