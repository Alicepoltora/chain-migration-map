import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoDataset } from "./lib/demo-data.mjs";
import { fetchNansenDexTrades, fetchNansenMigrations } from "./lib/nansen.mjs";
import { buildIntelligence } from "./lib/intelligence.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");

async function loadEnv() {
  const envFile = path.join(root, ".env");
  if (!existsSync(envFile)) return;
  const content = await readFile(envFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}

await loadEnv();

const PORT = Number(process.env.PORT || 8088);
const HOST = process.env.HOST || "0.0.0.0";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 900_000);
const cache = new Map();
const intelligenceCache = new Map();

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function json(res, status, payload) {
  res.writeHead(status, { "content-type": types[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function migrationData(window) {
  const key = process.env.NANSEN_API_KEY?.trim();
  if (!key) return demoDataset(window);
  const cached = cache.get(window);
  const ttl = window === "5m" ? Math.min(CACHE_TTL_MS, 240_000) : window === "1h" ? Math.min(CACHE_TTL_MS, 300_000) : CACHE_TTL_MS;
  if (cached && Date.now() - cached.time < ttl) return cached.data;
  try {
    const live = await fetchNansenMigrations(key, window);
    if (!live.routes.length) throw new Error("No cross-chain balance rotations were inferred for this period");
    cache.set(window, { time: Date.now(), data: live });
    return live;
  } catch (error) {
    return { ...demoDataset(window), mode: "fallback", label: "DEMO FALLBACK", fallbackReason: error.message };
  }
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(publicDir, requested));
  if (!file.startsWith(publicDir)) return json(res, 403, { error: "Forbidden" });
  if (!existsSync(file)) return json(res, 404, { error: "Not found" });
  res.writeHead(200, {
    "content-type": types[path.extname(file)] || "application/octet-stream",
    "cache-control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600"
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      service: "chain-migration-map",
      mode: process.env.NANSEN_API_KEY?.trim() ? "live" : "demo",
      time: new Date().toISOString()
    });
  }
  if (url.pathname === "/api/migrations") {
    const window = ["5m", "1h", "24h", "7d", "30d"].includes(url.searchParams.get("window")) ? url.searchParams.get("window") : "1h";
    return json(res, 200, await migrationData(window));
  }
  if (url.pathname === "/api/intelligence") {
    const window = ["5m", "1h", "24h", "7d", "30d"].includes(url.searchParams.get("window")) ? url.searchParams.get("window") : "1h";
    const routeId = url.searchParams.get("route") || null;
    const deep = url.searchParams.get("deep") === "1";
    const dataset = await migrationData(window);
    let trades = [];
    if (deep && process.env.NANSEN_API_KEY?.trim()) {
      const cachedTrades = intelligenceCache.get("dex-trades");
      if (cachedTrades && Date.now() - cachedTrades.time < 900_000) trades = cachedTrades.data;
      else {
        try {
          trades = await fetchNansenDexTrades(process.env.NANSEN_API_KEY.trim());
          intelligenceCache.set("dex-trades", { time: Date.now(), data: trades });
        } catch (error) {
          trades = [];
        }
      }
    }
    return json(res, 200, buildIntelligence(dataset, routeId, deep, trades));
  }
  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Chain Migration Map listening on http://${HOST}:${PORT}`);
});
