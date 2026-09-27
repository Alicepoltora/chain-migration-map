const NS = "http://www.w3.org/2000/svg";
const positions = {
  ethereum: [490, 350], base: [685, 215], solana: [750, 475], bnb: [220, 475], arc: [865, 345], monad: [420, 570], robinhood: [160, 225],
  arbitrum: [630, 105], avalanche: [295, 130], hyperevm: [805, 130], iotaevm: [95, 170], linea: [130, 345], mantle: [300, 620], optimism: [615, 600],
  plasma: [865, 560], polygon: [80, 545], sei: [545, 105], sonic: [520, 625]
};

const state = { window: "1h", minimum: 1_000, data: null, selected: null, selectedChain: "", animation: null, refreshTimer: null, intel: null };
const $ = (selector) => document.querySelector(selector);

function money(value, precision = 1) {
  const absolute = Math.abs(Number(value) || 0);
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(precision)}B`;
  if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(precision)}M`;
  if (absolute >= 1e3) return `${sign}$${(absolute / 1e3).toFixed(0)}K`;
  return `${sign}$${absolute.toFixed(0)}`;
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function curve(from, to, bend = 0.16) {
  const [x1, y1] = positions[from] || [490, 340];
  const [x2, y2] = positions[to] || [490, 340];
  const dx = x2 - x1, dy = y2 - y1;
  const mx = (x1 + x2) / 2 - dy * bend;
  const my = (y1 + y2) / 2 + dx * bend;
  return { d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`, label: [mx, my] };
}

function drawGrid() {
  const grid = $("#gridLayer");
  grid.replaceChildren();
  [120, 220, 320].forEach((radius) => grid.append(svg("circle", { cx: 490, cy: 350, r: radius, fill: "none", stroke: "rgba(255,255,255,.026)", "stroke-width": 1 })));
  [[490, 70, 490, 630], [95, 350, 885, 350]].forEach(([x1, y1, x2, y2]) => grid.append(svg("line", { x1, y1, x2, y2, stroke: "rgba(255,255,255,.025)" })));
}

function iconFor(node) {
  const group = svg("g", { class: "chain-icon", fill: node.color || "#dfe4e2" });
  const icon = node.icon || node.id;
  if (icon === "diamond") {
    group.append(svg("path", { d: "M0-14 8-2 0 4-8-2Z" }), svg("path", { d: "M0 7 8-1 0 14-8-1Z", opacity: ".55" }));
  } else if (icon === "bars") {
    group.append(svg("path", { d: "M-11-8h22v4h-22zM-8-1h16v4h-16zM-5 6h10v4h-10z", rx: 1 }));
  } else if (icon === "solana") {
    group.append(svg("path", { d: "M-12-9h18l5 4H-7zM-11-1h18l5 4H-6zM-12 7H6l-5 4h-18z", rx: 2 }));
  } else if (icon === "bnb") {
    group.append(svg("path", { d: "m0-15 6 6-6 6-6-6zm-10 10 4 4-4 4-4-4zm20 0 4 4-4 4-4-4zM0-1l6 6-6 6-6-6z" }));
  } else if (["avalanche", "plasma"].includes(icon)) {
    group.append(svg("path", { d: "M0-14 13 11H-13Z" }), svg("path", { d: "M0-6 5 5H-5Z", fill: "#0b0f13" }));
  } else if (icon === "polygon") {
    group.append(svg("path", { d: "m-12-2 7-4 6 3 6-3 5 3v7l-5 3-6-3-6 3-7-3zm7-1-4 2v3l4 2 4-2v-3zm12 0-4 2v3l4 2 3-2v-3z" }));
  } else if (["optimism", "arbitrum", "arc"].includes(icon)) {
    group.append(svg("path", { d: "M0-14a14 14 0 1 0 0 28A14 14 0 0 0 0-14m0 5a9 9 0 1 1 0 18A9 9 0 0 1 0-9" }));
    if (icon === "arbitrum") group.append(svg("path", { d: "m-7 8 7-16 7 16-4 0-3-8-3 8z", fill: "#9BA9FF" }));
  } else if (icon === "sonic") {
    group.append(svg("path", { d: "M-11-4 0-14 11-4 5-4 0 1-5-4zM-11 4 0 14 11 4 5 4 0-1-5 4z" }));
  } else {
    const text = svg("text", { x: 0, y: 1, class: "chain-icon-text" });
    text.textContent = (node.short || node.name.slice(0, 2)).slice(0, 3);
    group.append(text);
  }
  return group;
}

function downstreamRouteIds(root) {
  if (!root) return new Set(state.data?.routes.map((route) => route.id) || []);
  const ids = new Set();
  const frontier = new Set([root]);
  for (let depth = 0; depth < 6 && frontier.size; depth += 1) {
    const next = new Set();
    state.data.routes.forEach((route) => {
      if (frontier.has(route.from)) {
        ids.add(route.id);
        next.add(route.to);
      }
    });
    next.forEach((chain) => frontier.add(chain));
    for (const chain of frontier) if (chain !== root && !next.has(chain)) frontier.delete(chain);
  }
  return ids;
}

function visibleRoutes() {
  if (!state.data) return [];
  const routes = state.data.routes.filter((route) => route.valueUsd >= state.minimum);
  if (!state.selectedChain) return routes;
  const ids = downstreamRouteIds(state.selectedChain);
  return routes.filter((route) => ids.has(route.id) || route.to === state.selectedChain);
}

function renderMap() {
  const data = state.data;
  if (!data) return;
  const routeLayer = $("#routeLayer"), particleLayer = $("#particleLayer"), nodeLayer = $("#nodeLayer");
  routeLayer.replaceChildren(); particleLayer.replaceChildren(); nodeLayer.replaceChildren();
  cancelAnimationFrame(state.animation);
  const routes = visibleRoutes();
  const routePaths = [];
  const marker = svg("marker", { id: "arrowHead", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto", markerUnits: "strokeWidth" });
  marker.append(svg("path", { d: "M0,0 L8,4 L0,8 Z", fill: "#a7f36b", opacity: ".75" }));
  const defs = $("#migrationMap defs");
  defs.querySelector("#arrowHead")?.remove(); defs.append(marker);

  routes.forEach((route, index) => {
    const shape = curve(route.from, route.to, index % 2 ? -.13 : .13);
    const isSelected = state.selected === route.id;
    const dimmed = state.selectedChain && !route.id.includes(state.selectedChain);
    const base = svg("path", { d: shape.d, class: `route-base${isSelected ? " selected" : ""}${dimmed ? " dimmed" : ""}`, "data-route": route.id, "marker-end": "url(#arrowHead)", "stroke-width": Math.max(1, Math.min(4.8, route.valueUsd / 2_500_000)) });
    const hit = svg("path", { d: shape.d, class: "route-hit", "data-route": route.id });
    const labelGroup = svg("g", { class: `route-label-group${dimmed ? " dimmed" : ""}` });
    const labelText = svg("text", { x: shape.label[0], y: shape.label[1] - 7, class: "route-label" });
    labelText.textContent = money(route.valueUsd);
    const labelBox = svg("rect", { x: shape.label[0] - 28, y: shape.label[1] - 19, width: 56, height: 17, rx: 8, class: "route-label-box" });
    labelGroup.append(labelBox, labelText);
    hit.addEventListener("click", () => selectRoute(route.id));
    routeLayer.append(base, hit, labelGroup);
    const particleCount = Math.max(2, Math.min(7, Math.round(route.valueUsd / 4_000_000)));
    for (let i = 0; i < particleCount; i += 1) {
      const particle = svg("polygon", { points: "-6,-3 6,0 -6,3", class: `flow-arrow${isSelected ? " selected" : ""}` });
      particleLayer.append(particle);
      routePaths.push({ particle, path: base, offset: i / particleCount, speed: .000025 + Math.min(.000025, route.valueUsd / 1_000_000_000), length: base.getTotalLength() });
    }
  });

  data.nodes.forEach((node) => {
    const [x, y] = positions[node.id] || [490, 340];
    const selected = state.selectedChain === node.id;
    const group = svg("g", { transform: `translate(${x} ${y})`, class: `chain-node${selected ? " selected" : ""}${state.selectedChain && !selected ? " dimmed" : ""}` });
    group.append(
      svg("circle", { r: selected ? 40 : 35, class: "node-halo", stroke: node.color || "#a7f36b" }),
      svg("circle", { r: 27, class: "node-core" }),
      iconFor(node)
    );
    const name = svg("text", { x: 0, y: 49, class: "node-label" }); name.textContent = node.name;
    const flowText = svg("text", { x: 0, y: 64, class: "node-flow", fill: node.netFlowUsd >= 0 ? "#a7f36b" : "#fe7e67" }); flowText.textContent = money(node.netFlowUsd);
    group.append(name, flowText);
    group.addEventListener("click", () => selectChain(node.id));
    nodeLayer.append(group);
  });

  const started = performance.now();
  function animate(now) {
    for (const item of routePaths) {
      const progress = (item.offset + (now - started) * item.speed) % 1;
      const point = item.path.getPointAtLength(progress * item.length);
      const ahead = item.path.getPointAtLength(Math.min(item.length, progress * item.length + 1));
      const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180 / Math.PI;
      item.particle.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
      item.particle.setAttribute("opacity", Math.sin(progress * Math.PI) * .8 + .2);
    }
    state.animation = requestAnimationFrame(animate);
  }
  state.animation = requestAnimationFrame(animate);
}

function selectChain(id) {
  state.selectedChain = state.selectedChain === id ? "" : id;
  const selector = $("#chainSelector"); selector.value = state.selectedChain;
  $("#clearFocus").classList.toggle("hidden", !state.selectedChain);
  const node = state.data?.nodes.find((item) => item.id === state.selectedChain);
  $("#focusHelper").textContent = node ? `${node.name}: trace outgoing routes and their next hops.` : "Click any chain icon to follow its outgoing cascade.";
  renderMap();
}

function selectRoute(id) {
  state.selected = id;
  const route = state.data.routes.find((item) => item.id === id);
  if (!route) return;
  $("#inspectorEmpty").classList.add("hidden"); $("#inspectorContent").classList.remove("hidden");
  const from = state.data.nodes.find((node) => node.id === route.from) || { name: route.from };
  const to = state.data.nodes.find((node) => node.id === route.to) || { name: route.to };
  $("#confidence").textContent = `${route.confidence}% CONF.`;
  $("#fromName").textContent = from.name; $("#toName").textContent = to.name;
  $("#routeValue").textContent = money(route.valueUsd);
  $("#sourceName").textContent = `${from.name.toUpperCase()} NETFLOW`;
  $("#destinationName").textContent = `${to.name.toUpperCase()} NETFLOW`;
  $("#sourceDelta").textContent = money(route.sourceDeltaUsd ?? -route.valueUsd * 1.06);
  $("#destinationDelta").textContent = money(route.destinationDeltaUsd ?? route.valueUsd);
  $("#walletCount").textContent = route.wallets || route.assets.reduce((sum, asset) => sum + Number(asset.traderCount || 0), 0) || "AGG.";
  $("#bridgeEvidence").textContent = (route.bridgeEvidence || `${route.evidence} ASSETS`).toUpperCase();
  $("#routeChange").textContent = state.window.toUpperCase();
  const max = Math.max(...route.assets.map((asset) => asset.valueUsd), 1);
  $("#assetList").replaceChildren(...route.assets.map((asset) => {
    const row = document.createElement("div"); row.className = "asset-row";
    row.innerHTML = `<strong>${asset.symbol}</strong><div class="asset-bar"><span style="width:${asset.valueUsd / max * 100}%"></span></div><em>${money(asset.valueUsd)}</em>`;
    return row;
  }));
  renderMap();
  if ($("#intelDialog")?.open) loadIntel();
}

function textNode(tag, text, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text == null ? "—" : String(text);
  return node;
}

function renderIntel(data) {
  if (!data) return;
  $("#intelStatus").textContent = data.mode === "live" ? "LIVE · NANSEN" : "DEMO FALLBACK";
  $("#intelFresh").textContent = `${data.window.toUpperCase()} · ${new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  $("#intelConfidence").textContent = data.route ? `${data.route.confidence}% CONF.` : "NO ROUTE";

  const tokenGrid = $("#tokenAlphaGrid"); tokenGrid.replaceChildren();
  (data.tokens || []).slice(0, 12).forEach((token) => {
    const card = document.createElement("article"); card.className = "intel-token";
    const head = document.createElement("div"); head.className = "intel-token-head";
    head.append(textNode("strong", token.symbol), textNode("span", token.chain?.toUpperCase() || "—", "intel-chain"));
    const value = textNode("strong", money(token.netFlowUsd), `intel-token-value ${token.netFlowUsd >= 0 ? "positive" : "negative"}`);
    const meta = textNode("p", `${token.direction || "FLOW"} · ${token.traderCount || 0} traders`);
    const bar = document.createElement("div"); bar.className = "intel-bar"; const fill = document.createElement("span"); fill.style.width = `${Math.min(100, Math.max(4, token.signal || 40))}%`; bar.append(fill);
    card.append(head, value, meta, bar); tokenGrid.append(card);
  });
  if (!tokenGrid.children.length) tokenGrid.append(textNode("p", "No token-level rows returned for this window.", "empty-copy"));

  const evidenceList = $("#evidenceList"); evidenceList.replaceChildren();
  (data.evidence || []).forEach((item) => {
    const row = document.createElement("div"); row.className = "evidence-row";
    const mark = textNode("span", item.type, "evidence-mark"); const copy = document.createElement("div"); copy.append(textNode("strong", item.title), textNode("small", item.detail)); const status = textNode("b", item.status, `evidence-status ${item.status === "CHECK" ? "warning" : ""}`); row.append(mark, copy, status); evidenceList.append(row);
  });

  const cohortGrid = $("#cohortGrid"); cohortGrid.replaceChildren();
  (data.cohorts || []).forEach((cohort) => {
    const card = document.createElement("article"); card.className = "cohort-card";
    card.append(textNode("span", cohort.label, "eyebrow"), textNode("strong", money(cohort.flowUsd), cohort.flowUsd >= 0 ? "positive" : "negative"), textNode("small", cohort.window), textNode("b", cohort.stance, `cohort-stance ${cohort.color}`)); cohortGrid.append(card);
  });

  const walletList = $("#walletList"); walletList.replaceChildren();
  $("#deepIntel").textContent = data.deep ? "Live DEX layer loaded" : "Load live DEX trades";
  (data.wallets || []).forEach((wallet, index) => {
    const row = document.createElement("div"); row.className = "wallet-row";
    row.append(textNode("span", `0${index + 1}`, "wallet-rank"), textNode("div", wallet.walletLabel || `${wallet.wallet?.slice(0, 8)}…`, "wallet-name"), textNode("span", wallet.chain?.toUpperCase() || "—", "wallet-chain"), textNode("strong", money(wallet.valueUsd), "wallet-value")); walletList.append(row);
  });
  if (!walletList.children.length) walletList.append(textNode("p", "Load the live DEX trade layer to reveal wallets and transaction hashes.", "empty-copy"));

  const chainRadar = $("#chainRadar"); chainRadar.replaceChildren();
  const routeCount = new Map(); (state.data.routes || []).forEach((item) => routeCount.set(item.to, (routeCount.get(item.to) || 0) + 1));
  [...(state.data.nodes || [])].sort((a, b) => b.netFlowUsd - a.netFlowUsd).slice(0, 12).forEach((node, index) => {
    const row = document.createElement("div"); row.className = "chain-radar-row";
    const score = Math.min(99, Math.max(18, 50 + Math.round(node.netFlowUsd / Math.max(1, Number(data.summary?.totalMovedUsd || 1)) * 50) + (routeCount.get(node.id) || 0) * 4));
    row.append(textNode("span", `0${index + 1}`, "wallet-rank"), textNode("strong", node.name), textNode("span", money(node.netFlowUsd), node.netFlowUsd >= 0 ? "positive" : "negative"));
    const bar = document.createElement("div"); bar.className = "radar-bar"; const fill = document.createElement("span"); fill.style.width = `${score}%`; bar.append(fill); row.append(bar, textNode("b", `${score} SCORE`, "radar-score")); chainRadar.append(row);
  });

  const strategy = data.backtest || {}; $("#strategyLookback").textContent = strategy.lookback || "30D REPLAY";
  const strategyGrid = $("#strategyGrid"); strategyGrid.replaceChildren();
  [["HIT RATE", `${strategy.hitRate || 0}%`], ["SIGNALS", strategy.trades || 0], ["MULTIPLE", `${strategy.multiple || 1}×`], ["MAX DD", `${strategy.drawdown || 0}%`]].forEach(([label, value]) => { const card = document.createElement("div"); card.className = "strategy-stat"; card.append(textNode("span", label), textNode("strong", value)); strategyGrid.append(card); });
  $("#briefText").textContent = data.brief || "—";
  const alertList = $("#alertList"); alertList.replaceChildren();
  (data.alerts || []).forEach((alert) => {
    const row = document.createElement("label"); row.className = "alert-row"; const input = document.createElement("input"); input.type = "checkbox"; input.checked = localStorage.getItem(`current-alert-${alert.id}`) !== "off" && alert.enabled; input.addEventListener("change", () => localStorage.setItem(`current-alert-${alert.id}`, input.checked ? "on" : "off")); row.append(input, textNode("span", alert.title), textNode("small", alert.detail)); alertList.append(row);
  });
}

async function loadIntel(deep = false) {
  if (!state.data) return;
  $("#intelStatus").textContent = deep ? "READING DEX TRADES" : "READING NANSEN";
  try {
    const route = state.selected || state.data.routes[0]?.id || "";
    const response = await fetch(`/api/intelligence?window=${state.window}&route=${encodeURIComponent(route)}${deep ? "&deep=1" : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Intel request failed: ${response.status}`);
    state.intel = await response.json(); renderIntel(state.intel);
  } catch (error) {
    $("#intelStatus").textContent = "UNAVAILABLE";
  }
}

function renderPulse(values) {
  const chart = $("#pulseChart"); chart.replaceChildren();
  const vals = values.length ? values : [40, 43, 41, 49, 53, 51, 62, 67, 65, 74, 79, 84, 82, 91, 96];
  const min = Math.min(...vals), max = Math.max(...vals), width = 700, height = 68;
  const points = vals.map((value, index) => [index / (vals.length - 1) * width, height - 8 - ((value - min) / Math.max(1, max - min)) * 48]);
  const d = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const defs = svg("defs"); const gradient = svg("linearGradient", { id: "pulseArea", x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(svg("stop", { offset: "0%", "stop-color": "#a7f36b" }), svg("stop", { offset: "100%", "stop-color": "#a7f36b", "stop-opacity": 0 })); defs.append(gradient);
  chart.append(defs, svg("line", { x1: 0, y1: 56, x2: width, y2: 56, class: "pulse-guide" }), svg("path", { d: `${d} L${width},68 L0,68 Z`, class: "pulse-area" }), svg("path", { d, class: "pulse-line" }));
  const last = points.at(-1); chart.append(svg("circle", { cx: last[0], cy: last[1], r: 3, fill: "#a7f36b" }));
}

function updateChainSelector(nodes) {
  const selector = $("#chainSelector");
  const current = state.selectedChain;
  selector.replaceChildren(new Option("All blockchains", ""), ...nodes.sort((a, b) => a.name.localeCompare(b.name)).map((node) => new Option(node.name, node.id)));
  selector.value = current;
}

async function loadData() {
  $("#loadingState").classList.remove("done");
  try {
    const response = await fetch(`/api/migrations?window=${state.window}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    state.data = await response.json(); state.selected = null;
    updateChainSelector(state.data.nodes);
    $("#dataBadge").textContent = state.data.label;
    $("#dataBadge").style.color = state.data.mode === "live" ? "#a7f36b" : "#f1c85b";
    $("#updatedLabel").textContent = `UPDATED ${new Date(state.data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    $("#totalFlow").textContent = money(state.data.summary.totalMovedUsd);
    $("#activeWallets").textContent = Number(state.data.summary.activeWallets || 0).toLocaleString();
    $("#emergingChain").textContent = state.data.summary.emergingChain;
    $("#inspectorContent").classList.add("hidden"); $("#inspectorEmpty").classList.remove("hidden");
    renderMap(); renderPulse(state.data.pulse || []);
    const first = visibleRoutes()[0];
    if (first) setTimeout(() => selectRoute(first.id), 420);
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(loadData, state.window === "5m" ? 300_000 : state.window === "1h" ? 600_000 : 900_000);
  } catch (error) {
    $("#updatedLabel").textContent = "DATA UNAVAILABLE";
    $("#dataBadge").textContent = "ERROR";
  } finally {
    setTimeout(() => $("#loadingState").classList.add("done"), 320);
  }
}

drawGrid();
$("#windowControl").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-window]"); if (!button) return;
  $("#windowControl .active")?.classList.remove("active"); button.classList.add("active"); state.window = button.dataset.window; state.selectedChain = ""; loadData();
});
$("#minimumRange").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  state.minimum = value * 1_000_000; $("#minimumLabel").textContent = money(state.minimum).replace("+", ""); state.selected = null; renderMap();
});
$("#chainSelector").addEventListener("change", (event) => selectChain(event.target.value));
$("#clearFocus").addEventListener("click", () => selectChain(""));
$("#methodButton").addEventListener("click", () => $("#methodDialog").showModal());
$("#closeDialog").addEventListener("click", () => $("#methodDialog").close());
$("#methodDialog").addEventListener("click", (event) => { if (event.target === $("#methodDialog")) $("#methodDialog").close(); });
$("#intelButton").addEventListener("click", () => { $("#intelDialog").showModal(); loadIntel(); });
$("#closeIntel").addEventListener("click", () => $("#intelDialog").close());
$("#intelDialog").addEventListener("click", (event) => { if (event.target === $("#intelDialog")) $("#intelDialog").close(); });
$("#deepIntel").addEventListener("click", () => loadIntel(true));
$("#intelTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tab]"); if (!button) return;
  $("#intelTabs .active")?.classList.remove("active"); button.classList.add("active");
  document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== button.dataset.tab));
});
loadData();
