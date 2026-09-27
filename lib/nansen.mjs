import { inferNetflowMigrations } from "./migrations.mjs";

const API_ROOT = "https://api.nansen.ai/api/v1/smart-money";
const NETFLOW_URL = `${API_ROOT}/netflow`;
const DEX_TRADES_URL = `${API_ROOT}/dex-trades`;

function metricFor(window) {
  return window === "5m" || window === "1h" ? "net_flow_1h_usd" : `net_flow_${window}_usd`;
}

async function nansenPost(apiKey, url, body, page) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: apiKey },
    body: JSON.stringify({ ...body, pagination: { page, per_page: 1000 } }),
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.message || payload.detail || `Nansen request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

async function collectPages(apiKey, url, body) {
  const rows = [];
  let pagesFetched = 0;
  let complete = false;
  const maxPages = 50;
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await nansenPost(apiKey, url, body, page);
    pagesFetched = page;
    rows.push(...(payload.data || []));
    if (payload.pagination?.is_last_page !== false) {
      complete = true;
      break;
    }
  }
  return { rows, pagesFetched, complete };
}

function compactTokenRows(rows, metric) {
  const seen = new Map();
  for (const row of rows) {
    if (!row.chain || !row.token_symbol) continue;
    const key = `${row.chain}:${row.token_address || row.token_symbol}`;
    const value = Number(row[metric]) || 0;
    const current = seen.get(key);
    if (!current || Math.abs(value) > Math.abs(current.netFlowUsd)) {
      seen.set(key, {
        chain: row.chain,
        symbol: row.token_symbol,
        tokenAddress: row.token_address || null,
        netFlowUsd: value,
        marketCapUsd: Number(row.market_cap_usd) || 0,
        traderCount: Number(row.trader_count) || 0,
        sectors: Array.isArray(row.token_sectors) ? row.token_sectors : []
      });
    }
  }
  return [...seen.values()].sort((a, b) => Math.abs(b.netFlowUsd) - Math.abs(a.netFlowUsd)).slice(0, 80);
}

export async function fetchNansenDexTrades(apiKey, limit = 30) {
  const request = {
    chains: ["all"],
    filters: { trade_value_usd: { min: 1_000 } },
    order_by: [{ field: "trade_value_usd", direction: "DESC" }]
  };
  const payload = await nansenPost(apiKey, DEX_TRADES_URL, request, 1);
  return (payload.data || []).slice(0, limit).map((row) => ({
    chain: row.chain,
    timestamp: row.block_timestamp,
    hash: row.transaction_hash,
    wallet: row.trader_address,
    walletLabel: row.trader_address_label || "Smart Money wallet",
    bought: row.token_bought_symbol,
    sold: row.token_sold_symbol,
    valueUsd: Number(row.trade_value_usd) || 0,
    boughtMarketCapUsd: Number(row.token_bought_market_cap) || 0,
    boughtFdvUsd: Number(row.token_bought_fdv) || 0
  }));
}

function syntheticPulse(window, routes) {
  const factor = window === "5m" ? 0.08 : window === "1h" ? 0.35 : window === "24h" ? 0.65 : 1;
  const base = routes.reduce((sum, route) => sum + route.valueUsd, 0) || 1;
  return Array.from({ length: 18 }, (_, index) => Math.round(38 + (index / 17) * 48 + ((base / 1_000_000) % 9) * factor));
}

export async function fetchNansenMigrations(apiKey, window = "1h") {
  const metric = metricFor(window);
  const scale = window === "5m" ? 5 / 60 : 1;
  const request = {
    chains: ["all"],
    filters: { include_stablecoins: true, include_native_tokens: true },
    order_by: [{ field: metric, direction: "DESC" }]
  };
  const collected = await collectPages(apiKey, NETFLOW_URL, request);
  const inferred = inferNetflowMigrations(collected.rows, metric, window === "5m" ? 1_000 : window === "1h" ? 5_000 : 25_000, scale);
  const totalMovedUsd = inferred.routes.reduce((sum, route) => sum + route.valueUsd, 0);
  const activeWallets = collected.rows.reduce((sum, row) => sum + Number(row.trader_count || 0), 0);
  const dominant = inferred.routes[0];
  const emerging = [...inferred.nodes].sort((a, b) => b.netFlowUsd - a.netFlowUsd)[0];

  return {
    mode: "live",
    label: window === "5m" ? "LIVE · NANSEN · 5M TICK" : "LIVE · NANSEN",
    window,
    generatedAt: new Date().toISOString(),
    ...inferred,
    tokens: compactTokenRows(collected.rows, metric),
    pagesFetched: collected.pagesFetched,
    complete: collected.complete,
    pulse: syntheticPulse(window, inferred.routes),
    summary: {
      totalMovedUsd,
      activeWallets,
      dominantRoute: dominant ? `${dominant.from} → ${dominant.to}` : "No inferred route",
      emergingChain: emerging?.name || "—"
    },
    methodology: window === "5m"
      ? "5M is a normalized live tick from Nansen's rolling 1H Smart Money netflow, refreshed every five minutes; Nansen does not expose a native 5M aggregate."
      : `Inferred from Nansen Smart Money netflow (${metric.replace("net_flow_", "").replace("_usd", "")}) across all supported chains.`
  };
}
