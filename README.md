# CURRENT — Smart Money Migration Map

An interactive map of Smart Money capital rotation across chains, powered by Nansen. CURRENT turns cross-chain netflow into a route graph, then adds token alpha, evidence, cohorts, wallet trades, alerts and strategy replay.

## What the map measures

The live adapter reads Nansen Smart Money netflow across all supported chains. Negative flow on one network is matched with positive flow on another to form an **inferred migration route**. It is intentionally described as inferred rather than a verified bridge transfer.

The UI exposes 5M/1H/24H/7D/30D windows, animated routes, chain icons, cascade focus, token alpha, flow evidence, cohort lens, chain opportunity radar, live DEX trade wallet leaderboards, strategy replay, AI-style research briefs and browser-local alerts. When no API key is configured, the product uses an explicit `DEMO DATA` mode so mock data is never mistaken for live Nansen data.

## Run

```bash
cp .env.example .env
npm start
```

Open `http://localhost:8088`.

## Live Nansen data

Set `NANSEN_API_KEY` in `.env`. The server calls:

`POST https://api.nansen.ai/api/v1/smart-money/historical-holdings`

The server uses the Smart Money Netflow endpoint for the map and loads Smart Money DEX Trades only when the user opens the deep wallet layer. Responses are cached to protect API credits. The API key remains server-side.

The 5M view is a normalized live tick from Nansen's rolling 1H feed because Nansen does not expose a native 5-minute Smart Money netflow aggregate.

## API routes

- `GET /api/health` — service and live/demo status.
- `GET /api/migrations?window=1h` — route graph and chain nodes.
- `GET /api/intelligence?window=1h&route=solana-base` — token alpha, evidence, cohorts, strategy replay and brief.
- `GET /api/intelligence?window=1h&route=solana-base&deep=1` — additionally loads recent Nansen Smart Money DEX trades for wallet evidence.

## Verification

```bash
npm test
curl http://localhost:8088/api/health
curl 'http://localhost:8088/api/migrations?window=7d'
```

## Deployment

The deployment uses an isolated systemd service and port. It does not modify existing Nginx sites or application directories.
