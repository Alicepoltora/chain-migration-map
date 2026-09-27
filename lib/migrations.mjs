const CHAIN_META = {
  ethereum: { name: "Ethereum", short: "ETH", color: "#8DA2FB", icon: "diamond" },
  base: { name: "Base", short: "BASE", color: "#5A8BFF", icon: "bars" },
  solana: { name: "Solana", short: "SOL", color: "#7CEBC4", icon: "solana" },
  bnb: { name: "BNB Chain", short: "BNB", color: "#F1C85B", icon: "bnb" },
  arc: { name: "Arc", short: "ARC", color: "#FE7E67", icon: "arc" },
  monad: { name: "Monad", short: "MON", color: "#A786FF", icon: "monad" },
  robinhood: { name: "Robinhood", short: "RBN", color: "#A7F36B", icon: "robinhood" },
  arbitrum: { name: "Arbitrum", short: "ARB", color: "#9BA9FF", icon: "arbitrum" },
  avalanche: { name: "Avalanche", short: "AVAX", color: "#F34A5E", icon: "avalanche" },
  hyperevm: { name: "HyperEVM", short: "HYPE", color: "#E2F6FF", icon: "hyper" },
  iotaevm: { name: "IOTA EVM", short: "IOTA", color: "#8BDA7A", icon: "iota" },
  linea: { name: "Linea", short: "LINEA", color: "#DCE2E8", icon: "linea" },
  mantle: { name: "Mantle", short: "MNT", color: "#65D5BE", icon: "mantle" },
  optimism: { name: "Optimism", short: "OP", color: "#FF6D7A", icon: "optimism" },
  plasma: { name: "Plasma", short: "PLASMA", color: "#B7A4FF", icon: "plasma" },
  polygon: { name: "Polygon", short: "POL", color: "#A98CFF", icon: "polygon" },
  sei: { name: "Sei", short: "SEI", color: "#FE6E76", icon: "sei" },
  sonic: { name: "Sonic", short: "S", color: "#8BA4FF", icon: "sonic" }
};

export const SUPPORTED_CHAINS = Object.keys(CHAIN_META);
export const HISTORICAL_CHAINS = ["arc", "base", "bnb", "ethereum", "monad", "robinhood", "solana"];

const cleanNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function keyed(chain, symbol) {
  return `${chain}:${symbol}`;
}

function buildRoutes(changesByToken, minimumUsd = 25_000) {
  const routeMap = new Map();
  for (const [symbol, changes] of changesByToken) {
    const sources = changes.filter((item) => item.delta < -minimumUsd).map((item) => ({ ...item, remaining: -item.delta })).sort((a, b) => b.remaining - a.remaining);
    const destinations = changes.filter((item) => item.delta > minimumUsd).map((item) => ({ ...item, remaining: item.delta })).sort((a, b) => b.remaining - a.remaining);

    for (const source of sources) {
      for (const destination of destinations) {
        if (source.remaining <= 0 || destination.remaining <= 0 || source.chain === destination.chain) continue;
        const amount = Math.min(source.remaining, destination.remaining);
        if (amount < minimumUsd) continue;
        const key = `${source.chain}>${destination.chain}`;
        const current = routeMap.get(key) || {
          id: key.replace(">", "-"),
          from: source.chain,
          to: destination.chain,
          valueUsd: 0,
          assets: [],
          evidence: 0
        };
        current.valueUsd += amount;
        current.assets.push({
          symbol,
          valueUsd: amount,
          tokenAddress: destination.tokenAddress || source.tokenAddress || null,
          marketCapUsd: destination.marketCapUsd || source.marketCapUsd || null,
          traderCount: Math.max(destination.holders || 0, source.holders || 0),
          sectors: destination.sectors || source.sectors || []
        });
        current.evidence += 1;
        routeMap.set(key, current);
        source.remaining -= amount;
        destination.remaining -= amount;
      }
    }
  }
  return [...routeMap.values()]
    .map((route) => ({
      ...route,
      confidence: Math.min(94, 58 + route.evidence * 7),
      assets: route.assets.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 4),
      sourceDeltaUsd: -Math.round(route.valueUsd * 1.06),
      destinationDeltaUsd: Math.round(route.valueUsd),
      bridgeEvidence: route.evidence >= 3 ? "Multi-asset" : route.evidence === 2 ? "Matched" : "Directional"
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
}

function shapeResult(routes, chainBalances = new Map(), metadata = {}) {
  const netByChain = new Map();
  for (const route of routes) {
    netByChain.set(route.from, (netByChain.get(route.from) || 0) - route.valueUsd);
    netByChain.set(route.to, (netByChain.get(route.to) || 0) + route.valueUsd);
  }
  const activeChains = new Set([...(metadata.includeChains || []), ...routes.flatMap((route) => [route.from, route.to])]);
  const nodes = [...activeChains].map((id) => ({
    id,
    ...(CHAIN_META[id] || { name: id, short: id.slice(0, 4).toUpperCase(), color: "#9FA7B3", icon: "generic" }),
    balanceUsd: chainBalances.get(id) || 0,
    netFlowUsd: netByChain.get(id) || 0
  }));
  const { includeChains, ...safeMetadata } = metadata;
  return { nodes, routes, ...safeMetadata };
}

function aggregateNetflowRoutes(rows, metric, scale, minimumUsd) {
  const byChain = new Map();
  for (const row of rows) {
    if (!row.chain) continue;
    const value = cleanNumber(row[metric]) * scale;
    byChain.set(row.chain, (byChain.get(row.chain) || 0) + value);
  }
  const sources = [...byChain].filter(([, value]) => value < -minimumUsd).map(([chain, value]) => ({ chain, remaining: -value })).sort((a, b) => b.remaining - a.remaining);
  const destinations = [...byChain].filter(([, value]) => value > minimumUsd).map(([chain, value]) => ({ chain, remaining: value })).sort((a, b) => b.remaining - a.remaining);
  const routes = [];
  for (const source of sources) {
    for (const destination of destinations) {
      if (source.remaining <= 0 || destination.remaining <= 0 || source.chain === destination.chain) continue;
      const amount = Math.min(source.remaining, destination.remaining);
      if (amount < minimumUsd) continue;
      routes.push({
        id: `${source.chain}-${destination.chain}`,
        from: source.chain,
        to: destination.chain,
        valueUsd: amount,
        assets: [{ symbol: "MIXED", valueUsd: amount }],
        evidence: 0,
        confidence: 58,
        sourceDeltaUsd: -Math.round(amount),
        destinationDeltaUsd: Math.round(amount),
        bridgeEvidence: "Aggregate"
      });
      source.remaining -= amount;
      destination.remaining -= amount;
    }
  }
  return routes;
}

export function inferMigrations(rows, minimumUsd = 25_000) {
  if (!Array.isArray(rows) || rows.length === 0) return { nodes: [], routes: [] };

  const dates = [...new Set(rows.map((row) => row.date).filter(Boolean))].sort();
  if (dates.length < 2) return { nodes: [], routes: [] };
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  const first = new Map();
  const last = new Map();

  for (const row of rows) {
    if (!row.chain || !row.token_symbol) continue;
    const entry = {
      chain: row.chain,
      symbol: row.token_symbol,
      value: cleanNumber(row.value_usd),
      balance: cleanNumber(row.balance),
      holders: cleanNumber(row.holders_count)
    };
    const key = keyed(entry.chain, entry.symbol);
    if (row.date === firstDate) first.set(key, entry);
    if (row.date === lastDate) last.set(key, entry);
  }

  const changesByToken = new Map();
  const chainBalances = new Map();
  for (const [key, end] of last) {
    const start = first.get(key) || { value: 0, balance: 0, holders: 0 };
    const delta = end.value - start.value;
    if (!changesByToken.has(end.symbol)) changesByToken.set(end.symbol, []);
    changesByToken.get(end.symbol).push({ ...end, startValue: start.value, delta });
    chainBalances.set(end.chain, (chainBalances.get(end.chain) || 0) + end.value);
  }

  return shapeResult(buildRoutes(changesByToken, minimumUsd), chainBalances, { from: firstDate, to: lastDate });
}

export function inferNetflowMigrations(rows, metric = "net_flow_24h_usd", minimumUsd = 25_000, scale = 1) {
  if (!Array.isArray(rows) || rows.length === 0) return { nodes: [], routes: [] };
  const changesByToken = new Map();
  const balances = new Map();
  for (const row of rows) {
    if (!row.chain || !row.token_symbol) continue;
    const delta = cleanNumber(row[metric]) * scale;
    if (!changesByToken.has(row.token_symbol)) changesByToken.set(row.token_symbol, []);
    changesByToken.get(row.token_symbol).push({
      chain: row.chain,
      symbol: row.token_symbol,
      delta,
      startValue: Math.max(0, cleanNumber(row.market_cap_usd)),
      value: Math.abs(delta),
      holders: cleanNumber(row.trader_count),
      tokenAddress: row.token_address || null,
      marketCapUsd: cleanNumber(row.market_cap_usd),
      sectors: Array.isArray(row.token_sectors) ? row.token_sectors : []
    });
    balances.set(row.chain, (balances.get(row.chain) || 0) + Math.abs(delta));
  }
  const matched = buildRoutes(changesByToken, minimumUsd);
  const routes = matched.length ? matched : aggregateNetflowRoutes(rows, metric, scale, minimumUsd);
  return shapeResult(routes, balances, { metric, scale, includeChains: SUPPORTED_CHAINS });
}

export function chainMeta(id) {
  return CHAIN_META[id] || { name: id, short: id.slice(0, 4).toUpperCase(), color: "#9FA7B3", icon: "generic" };
}
