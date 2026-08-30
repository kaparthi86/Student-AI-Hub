const STORAGE_KEY = "aihub.privacy-agent.v1";
const DISCLAIMER_KEY = "aihub.privacy-agent.disclaimer.v2";
const ANALYTICS_KEY = "aihub.privacy-agent.analytics.v1";

const DEFAULT_STATE = {
  rules: {
    filter: "off",
    shopping: "never",
    health: "never",
    identity: "checkout_ok",
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    const rules = { ...DEFAULT_STATE.rules, ...(parsed.rules || {}) };
    if (rules.filter === "house") rules.filter = "network";
    return { rules };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function loadAnalytics() {
  try {
    return {
      networkProtected: false,
      localBlocked: 0,
      ...JSON.parse(localStorage.getItem(ANALYTICS_KEY) || "{}"),
    };
  } catch {
    return { networkProtected: false, localBlocked: 0 };
  }
}

function saveAnalytics(next) {
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(next));
}

const analytics = loadAnalytics();
const state = loadState();
const els = {
  disclaimer: document.getElementById("privacyDisclaimerModal"),
};

function filterOn() {
  return Boolean(state.rules.filter && state.rules.filter !== "off");
}

function resetLiveCounts() {
  analytics.networkProtected = false;
  analytics.localBlocked = 0;
  saveAnalytics(analytics);
}

async function renderAnalyticsBanner() {
  const trackingEl = document.getElementById("analyticsTracking");
  const blockedEl = document.getElementById("analyticsBlocked");
  const deviceEl = document.getElementById("analyticsDevice");
  const banner = document.getElementById("privacyAnalytics");
  if (!trackingEl || !blockedEl || !deviceEl) return;

  const live = filterOn();
  const domains = live ? Array.from(await currentBlockSet()) : [];
  const tracking = domains.length;
  const liveNow = live && (analytics.networkProtected || analytics.localBlocked > 0);
  const blocked = liveNow ? tracking : Number(analytics.localBlocked || 0);
  const deviceLabel = liveNow ? "Protected" : live ? "Armed" : "Off";

  trackingEl.textContent = String(tracking);
  blockedEl.textContent = String(blocked);
  deviceEl.textContent = deviceLabel;
  trackingEl.className = liveNow ? "is-ok" : live ? "is-over" : "is-tight";
  blockedEl.className = blocked ? "is-ok" : "is-tight";
  deviceEl.className = liveNow ? "is-ok" : live ? "is-tight" : "is-over";
  if (banner) banner.dataset.state = liveNow ? "protected" : live ? "armed" : "exposed";

  const kicker = document.getElementById("analyticsKicker");
  if (kicker) {
    kicker.textContent = liveNow
      ? "Live house analytics"
      : live
        ? "Armed — waiting for a live check"
        : "Filter off";
  }
}

function renderRules() {
  document.querySelectorAll("[data-rule]").forEach((group) => {
    const rule = group.getAttribute("data-rule");
    const value = state.rules[rule];
    group.querySelectorAll("button[data-value]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-value") === value ? "true" : "false");
    });
  });
}

function persistAndPaint() {
  saveState(state);
  renderRules();
  renderHouseFilter();
  renderAnalyticsBanner();
  syncHouseRules();
}

function houseApi(path) {
  return `/api/privacy-dns${path}`;
}

function listLabel(id) {
  if (id === "always") return "fingerprinting";
  if (id === "advertising") return "shopping ads";
  if (id === "health") return "health-adjacent trackers";
  if (id === "brokers") return "data brokers";
  return id;
}

function setHouseStatus(message) {
  const el = document.getElementById("houseFilterStatus");
  if (el) el.textContent = message || "";
}

function setHidden(id, hidden) {
  document.getElementById(id)?.classList.toggle("hidden", hidden);
}

function blocklistUrl() {
  const query = new URLSearchParams({
    shopping: state.rules.shopping,
    health: state.rules.health,
    identity: state.rules.identity,
  });
  return `${window.location.origin}/api/privacy-blocklist?${query.toString()}`;
}

function paintHouseSnapshot(data, extraMessage) {
  const mode = state.rules.filter || "off";
  const running = mode === "computer" && Boolean(data?.running);
  window.__houseFilterRunning = running;

  const label = document.getElementById("houseFilterStateLabel");
  if (label) {
    if (mode === "off") label.textContent = "Filter off";
    else if (mode === "network") label.textContent = "On my network — apply the list, then check";
    else if (running) label.textContent = "Live — this computer";
    else label.textContent = "This computer — waiting to start";
  }

  setHidden("houseLiveControls", mode === "off");
  setHidden("houseOffNote", mode !== "off");
  setHidden("houseLiveCount", mode !== "computer");
  setHidden("testHouseFilterBtn", !(running && mode === "computer"));
  setHidden("houseComputerSteps", mode !== "computer");
  setHidden("houseNetworkSteps", mode !== "network");

  const liveCount = document.getElementById("houseLiveCount");
  if (liveCount) {
    liveCount.textContent = running ? `Live local blocks: ${data?.stats?.blocked ?? 0}` : "Live local blocks: 0";
  }

  if (mode === "off") {
    resetLiveCounts();
  } else {
    analytics.localBlocked = running ? Number(data?.stats?.blocked || 0) : 0;
    saveAnalytics(analytics);
  }
  renderAnalyticsBanner();

  if (extraMessage) {
    setHouseStatus(extraMessage);
    return;
  }
  if (mode === "off") {
    setHouseStatus("Nothing from this app is being applied to your traffic.");
    return;
  }
  if (mode === "network") {
    setHouseStatus("Add the house list on your phone or router, then tap Check this network.");
    return;
  }
  if (running) {
    const ip = (data.lan && data.lan[0]) || "this computer";
    setHouseStatus(`Local DNS is on. Set this computer to 127.0.0.1 or the router to ${ip}.`);
    return;
  }
  setHouseStatus("Choose On my network to protect phones and Wi-Fi, or This computer for a local DNS server.");
}

function renderHouseFilter() {
  const mount = document.getElementById("houseActiveLists");
  const filter = window.PrivacyHouseFilter;
  const urlInput = document.getElementById("houseBlocklistUrl");
  if (urlInput) urlInput.value = blocklistUrl();
  if (!mount || !filter) return;
  const lists = filter.enabledLists(state.rules);
  mount.textContent = `Active lists: ${lists.map(listLabel).join(", ")}.`;
}

async function refreshHouseSnapshot() {
  try {
    const res = await fetch(houseApi("/status"));
    const data = await res.json();
    paintHouseSnapshot(data);
    return data;
  } catch {
    paintHouseSnapshot({ running: false });
    return null;
  }
}

async function syncHouseRules() {
  if (!window.__houseFilterRunning) return;
  try {
    const res = await fetch(houseApi("/rules"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.rules),
    });
    if (!res.ok) return;
    paintHouseSnapshot(await res.json());
  } catch {
    /* filter not running */
  }
}

async function loadListTexts() {
  if (window.__privacyListTexts) return window.__privacyListTexts;
  const filter = window.PrivacyHouseFilter;
  const texts = {};
  await Promise.all(
    (filter?.LIST_IDS || []).map(async (id) => {
      const res = await fetch(`./lists/${id}.txt`);
      texts[id] = res.ok ? await res.text() : "";
    })
  );
  window.__privacyListTexts = texts;
  return texts;
}

async function currentBlockSet() {
  const filter = window.PrivacyHouseFilter;
  if (!filter) return new Set();
  const texts = await loadListTexts();
  return filter.buildBlockSet(texts, state.rules);
}

function probeUrl(url, timeoutMs) {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve("timeout");
    }, timeoutMs);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve("load");
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve("error");
    };
    image.src = url;
  });
}

async function checkThisNetwork() {
  if (!filterOn()) {
    setHouseStatus("Turn the house filter on before checking this network.");
    return;
  }
  const resultEl = document.getElementById("houseTestResult");
  if (resultEl) resultEl.textContent = "Checking this device’s network…";
  const stamp = Date.now();
  const safe = await probeUrl(`https://www.example.com/favicon.ico?cb=${stamp}`, 4000);
  const tracker = await probeUrl(`https://www.google-analytics.com/analytics.js?cb=${stamp}`, 4000);
  if (!resultEl) return;
  if (safe !== "load") {
    resultEl.textContent = "This device looks offline. Connect to Wi-Fi and check again.";
    return;
  }
  if (tracker === "error" || tracker === "timeout") {
    resultEl.textContent =
      "Live check passed. This device cannot load google-analytics.com, so the house list is working on this network.";
    analytics.networkProtected = true;
    saveAnalytics(analytics);
    renderAnalyticsBanner();
    return;
  }
  analytics.networkProtected = false;
  saveAnalytics(analytics);
  renderAnalyticsBanner();
  resultEl.textContent =
    "This device can still reach google-analytics.com. Add the house list in AdGuard or NextDNS, set DNS, then check again.";
}

function bindHouseFilter() {
  document.getElementById("copyBlocklistBtn")?.addEventListener("click", async () => {
    const url = blocklistUrl();
    try {
      await navigator.clipboard.writeText(url);
      setHouseStatus("House list link copied. Paste it into AdGuard or NextDNS.");
    } catch {
      document.getElementById("houseBlocklistUrl")?.select();
      setHouseStatus("Copy the house list link from the box, then paste it into AdGuard or NextDNS.");
    }
  });
  document.getElementById("checkNetworkBtn")?.addEventListener("click", () => {
    checkThisNetwork();
  });
  document.getElementById("testHouseFilterBtn")?.addEventListener("click", async () => {
    const resultEl = document.getElementById("houseTestResult");
    if (resultEl) resultEl.textContent = "Sending a real DNS query through the house filter…";
    try {
      const res = await fetch(houseApi("/test"), { method: "POST" });
      const data = await res.json();
      paintHouseSnapshot(data);
      if (!resultEl) return;
      if (data.real) {
        resultEl.textContent = `Real block confirmed. ${data.tracker.name} → ${data.tracker.address}. ${data.allowed.name} still resolves to ${data.allowed.address}.`;
        return;
      }
      resultEl.textContent =
        data.error ||
        `Not a real house block yet. Tracker ${data.tracker?.name || ""} → ${data.tracker?.address || "no answer"}.`;
    } catch {
      if (resultEl) resultEl.textContent = "Could not run the real DNS test. Is AI Hub running on this computer?";
    }
  });
  refreshHouseSnapshot().then(() => {
    if (state.rules.filter === "computer") applyFilterChoice("computer");
  });
  window.setInterval(refreshHouseSnapshot, 8000);
}

async function applyFilterChoice(value) {
  const resultEl = document.getElementById("houseTestResult");
  if (resultEl) resultEl.textContent = "";
  if (value === "off") {
    resetLiveCounts();
    try {
      await fetch(houseApi("/stop"), { method: "POST" }).catch(() => null);
    } catch {
      /* hosted users will not have a local filter */
    }
    paintHouseSnapshot({ running: false });
    return;
  }
  if (value === "network") {
    try {
      await fetch(houseApi("/stop"), { method: "POST" }).catch(() => null);
    } catch {
      /* hosted users will not have a local filter */
    }
    paintHouseSnapshot({ running: false });
    return;
  }
  setHouseStatus("Starting the local DNS filter…");
  try {
    await fetch(houseApi("/rules"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.rules),
    }).catch(() => null);
    const res = await fetch(houseApi("/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      paintHouseSnapshot(data, data.hint || data.error || "Could not start the house filter.");
      return;
    }
    paintHouseSnapshot(data);
  } catch {
    setHouseStatus("Could not start the house filter. Run AI Hub on this computer first.");
  }
}

function bindRules() {
  document.querySelectorAll("[data-rule] button[data-value]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const group = btn.closest("[data-rule]");
      const rule = group?.getAttribute("data-rule");
      const value = btn.getAttribute("data-value");
      if (!rule || !value) return;
      state.rules[rule] = value;
      persistAndPaint();
      if (rule === "filter") applyFilterChoice(value);
    });
  });
}

function bindDisclaimer() {
  const ack = document.getElementById("privacyDisclaimerAckBtn");
  const back = document.getElementById("privacyDisclaimerBackBtn");
  const seen = localStorage.getItem(DISCLAIMER_KEY) === "1";
  if (!seen) els.disclaimer?.classList.remove("hidden");
  ack?.addEventListener("click", () => {
    localStorage.setItem(DISCLAIMER_KEY, "1");
    els.disclaimer?.classList.add("hidden");
  });
  back?.addEventListener("click", () => {
    window.location.href = "../";
  });
}

let supabaseClient = null;

function goToHub() {
  window.location.href = "../";
}

function bindChrome() {
  document.getElementById("backToHubFromPrivacyBtn")?.addEventListener("click", goToHub);
  const menu = document.querySelector(".account-menu");
  const btn = menu?.querySelector(".account-menu-btn");
  const panel = menu?.querySelector(".account-menu-panel");
  const closeMenu = () => {
    panel?.classList.add("hidden");
    btn?.setAttribute("aria-expanded", "false");
  };
  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const willOpen = panel?.classList.contains("hidden");
    closeMenu();
    if (willOpen) {
      panel?.classList.remove("hidden");
      btn?.setAttribute("aria-expanded", "true");
    }
  });
  panel?.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".account-menu")) return;
    closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
  document.getElementById("privacySettingsBtn")?.addEventListener("click", goToHub);
  document.getElementById("privacyLogoutBtn")?.addEventListener("click", async () => {
    closeMenu();
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch {
        /* still leave the workspace */
      }
    }
    goToHub();
  });
}

async function ensureHubSession() {
  const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG || {};
  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) return;
  try {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    if (!data?.session) window.location.replace("../");
  } catch {
    /* stay on the page if auth cannot be checked */
  }
}

bindChrome();
bindRules();
bindHouseFilter();
bindDisclaimer();
persistAndPaint();
ensureHubSession();
