/* Customer-only equipment display. No employee or maintenance-record requests. */
(function (root) {
  "use strict";
  const ENDPOINT = "https://i240status.mccrarytechnology.com/v1/i240/coin-changers";
  const MAX_AGE_MS = 300000;
  const POSITIONS = Object.freeze({ "1": "left", "4": "right" });
  const COPY = Object.freeze({
    operating: { label: "Operating", tone: "good", note: "Recorded as operating in CoinOp." },
    operating_with_warning: { label: "Operating with warning", tone: "warning", note: "Check with the attendant before use." },
    out_of_order: { label: "Out of order", tone: "bad", note: "Please use the other changer or ask an attendant." },
    condemned: { label: "Out of service", tone: "bad", note: "This changer is not available for use." },
    unknown: { label: "Status unavailable", tone: "unknown", note: "Ask the attendant or call the store." }
  });
  const unknown = () => ({ available: false, readAt: null, machines: ["1", "4"].map(number => ({ number, status: "unknown" })) });

  function parseTimestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
    return Date.parse(value);
  }

  function isFresh(readAt, now) {
    const age = now - readAt;
    return Number.isFinite(readAt) && Number.isFinite(now) && age >= -30000 && age <= MAX_AGE_MS;
  }

  function parsePayload(data, now) {
    if (!data || data.version !== 1 || data.store !== "i240" || data.status !== "ok") return unknown();
    const readAt = parseTimestamp(data.sourceReadAt);
    if (!isFresh(readAt, now) || !Array.isArray(data.coinChangers) || data.coinChangers.length !== 2) return unknown();
    const byNumber = new Map();
    for (const row of data.coinChangers) {
      if (!row || typeof row !== "object" || Object.keys(row).sort().join(",") !== "number,position,status" ||
          !Object.prototype.hasOwnProperty.call(POSITIONS, row.number) || typeof row.number !== "string" ||
          byNumber.has(row.number) || row.position !== POSITIONS[row.number] ||
          typeof row.status !== "string" || !Object.prototype.hasOwnProperty.call(COPY, row.status)) return unknown();
      byNumber.set(row.number, { number: row.number, status: row.status });
    }
    if (byNumber.size !== 2) return unknown();
    return { available: true, readAt, machines: [byNumber.get("1"), byNumber.get("4")] };
  }

  function validEndpoint(value) {
    return typeof value === "string" && value === ENDPOINT;
  }

  // Pure helpers are exported for offline tests; no browser is started by Node.
  if (typeof module === "object" && module.exports) {
    module.exports = { parsePayload, isFresh, validEndpoint, COPY, ENDPOINT, MAX_AGE_MS };
    return;
  }
  if (!root.document) return;
  const doc = root.document;
  const section = doc.getElementById("coin-changers");
  if (!section) return;
  const refreshButton = doc.getElementById("coin-refresh");
  const summary = doc.getElementById("coin-summary");
  const updated = doc.getElementById("coin-updated");
  const cards = ["1", "4"].map(number => ({
    number,
    card: doc.getElementById("coin-card-" + number),
    status: doc.getElementById("coin-status-" + number),
    note: doc.getElementById("coin-note-" + number)
  }));
  if (!refreshButton || !summary || !updated || cards.some(row => !row.card || !row.status || !row.note)) return;
  const cfg = root.COINOP_SITE || {};
  let last = unknown();
  let pending = false;
  let requestNumber = 0;

  function render(model) {
    last = model;
    cards.forEach(row => {
      const entry = model.machines.find(item => item.number === row.number);
      const copy = COPY[entry ? entry.status : "unknown"] || COPY.unknown;
      row.card.dataset.condition = copy.tone;
      row.status.textContent = copy.label;
      row.note.textContent = copy.note;
    });
    const message = model.available ? "Latest recorded conditions from CoinOp." : "Machine status is unavailable. Please ask the attendant or call before visiting.";
    if (summary.textContent !== message) summary.textContent = message;
    if (model.available) {
      const formatted = new Intl.DateTimeFormat("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"
      }).format(new Date(model.readAt));
      updated.textContent = "CoinOp records read " + formatted + " Central. Refreshes about every minute.";
    } else {
      updated.textContent = "Fresh recorded machine conditions could not be verified.";
    }
  }

  function expire() {
    if (last.available && !isFresh(last.readAt, Date.now())) render(unknown());
  }

  async function refresh() {
    expire();
    if (pending) return;
    if (!validEndpoint(cfg.publicMachineStatusUrl)) {
      render(unknown());
      return;
    }
    pending = true;
    const thisRequest = ++requestNumber;
    refreshButton.disabled = true;
    refreshButton.textContent = "Checking…";
    const controller = new AbortController();
    const timeout = root.setTimeout(() => controller.abort(), 8000);
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set("v", String(Date.now()));
      const response = await root.fetch(url.href, {
        method: "GET", mode: "cors", credentials: "omit", cache: "no-store",
        redirect: "error", signal: controller.signal
      });
      if (!response.ok || !(response.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) throw new Error("Unavailable feed");
      const text = await response.text();
      if (text.length > 32768) throw new Error("Oversized feed");
      const model = parsePayload(JSON.parse(text), Date.now());
      if (thisRequest === requestNumber) render(model);
    } catch (_error) {
      if (thisRequest === requestNumber) render(unknown());
    } finally {
      root.clearTimeout(timeout);
      pending = false;
      refreshButton.disabled = false;
      refreshButton.textContent = "Refresh status";
    }
  }

  refreshButton.addEventListener("click", refresh);
  doc.addEventListener("visibilitychange", () => {
    if (!doc.hidden) { expire(); refresh(); }
  });
  root.addEventListener("online", refresh);
  root.addEventListener("offline", () => { ++requestNumber; render(unknown()); });
  root.addEventListener("pageshow", () => { expire(); refresh(); });
  root.setInterval(() => { if (!doc.hidden) refresh(); }, 60000);
  root.setInterval(expire, 1000);
  refresh();
})(typeof window === "object" ? window : globalThis);
