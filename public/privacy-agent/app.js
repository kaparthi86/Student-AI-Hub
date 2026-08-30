const STORAGE_KEY = "aihub.privacy-agent.v1";
const DISCLAIMER_KEY = "aihub.privacy-agent.disclaimer.v2";

const SCENARIOS = [
  {
    id: "shopping-ad",
    category: "shopping",
    purpose: "advertising",
    actor: "ShopFast → AdNet",
    title: "A shop wants to share your cart with an ad network",
    detail: "They asked for city and “what you like” so other sites can retarget you.",
    wants: ["city", "interest"],
  },
  {
    id: "health-ad",
    category: "health",
    purpose: "advertising",
    actor: "WellnessDaily → advertisers",
    title: "A health article wants to sell a symptom interest",
    detail: "They inferred “back pain” and want to add it to your ad profile.",
    wants: ["interest"],
  },
  {
    id: "checkout",
    category: "identity",
    purpose: "checkout",
    actor: "BookNook checkout",
    title: "Checkout needs an email for the receipt",
    detail: "This is a first-party purchase, not an ad company.",
    wants: ["email"],
  },
  {
    id: "broker",
    category: "broker",
    purpose: "resale",
    actor: "PeopleGraph",
    title: "A data broker already has your phone number",
    detail: "They did not ask this time — they bought a copy last year.",
    wants: ["phone"],
  },
  {
    id: "ai-agent",
    category: "ai",
    purpose: "advertising",
    actor: "ShopPilot AI",
    title: "An AI shopping agent wants 30 days of purchases",
    detail: "It wants the raw history, not a yes/no about running shoes.",
    wants: ["interest", "city", "email"],
  },
];

const DEFAULT_STATE = {
  rules: {
    filter: "off",
    shopping: "ok_for_discounts",
    health: "never",
    identity: "checkout_ok",
  },
  vault: {
    name: "Alex Rivera",
    email: "alex@example.com",
    phone: "555-0148",
    city: "Austin",
    interest: "running",
  },
  log: [],
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      rules: { ...DEFAULT_STATE.rules, ...(parsed.rules || {}) },
      vault: { ...DEFAULT_STATE.vault, ...(parsed.vault || {}) },
      log: Array.isArray(parsed.log) ? parsed.log.slice(0, 30) : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function decide(scenario, rules, vault) {
  if (scenario.category === "broker") {
    return {
      action: "revoke",
      headline: "Take this copy back",
      body: `${scenario.actor} already holds a copy. The agent cannot unsell history by blocking a pixel — it files a revoke for the fields they listed.`,
      released: {},
    };
  }

  if (scenario.category === "health") {
    if (rules.health === "never") {
      return {
        action: "block",
        headline: "Blocked — health stays home",
        body: "House rule: health, family, and location are never used for advertising. Nothing left the vault.",
        released: {},
      };
    }
  }

  if (scenario.purpose === "checkout") {
    if (rules.identity === "checkout_ok") {
      return {
        action: "release",
        headline: "Released only what checkout needs",
        body: `Email went to ${scenario.actor}. Phone, city, and interests stayed in the vault.`,
        released: { email: vault.email },
      };
    }
    return {
      action: "block",
      headline: "Blocked — identity stays in the vault",
      body: "Checkout cannot take a name or email until you allow identity for purchases.",
      released: {},
    };
  }

  if (scenario.category === "shopping" || scenario.category === "ai") {
    if (rules.shopping === "ok_for_discounts") {
      const released = {};
      if (vault.city) released.city = vault.city;
      if (vault.interest) released.interest = vault.interest;
      return {
        action: "minimal",
        headline: "Released a small claim, not the person",
        body: `${scenario.actor} received a substitute: city and interest only. Email and phone stayed in the vault.`,
        released,
      };
    }
    return {
      action: "block",
      headline: "Blocked — shopping ads are off",
      body: "Your shopping rule is never. The agent refused the profile request.",
      released: {},
    };
  }

  return {
    action: "block",
    headline: "Blocked by default",
    body: "If a request does not match a house rule, nothing leaves.",
    released: {},
  };
}

function weekCounts(log) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = log.filter((item) => item.at >= weekAgo);
  return {
    blocked: recent.filter((item) => item.action === "block").length,
    released: recent.filter((item) => item.action === "minimal" || item.action === "release").length,
    revoked: recent.filter((item) => item.action === "revoke").length,
  };
}

function formatWhen(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

function actionLabel(action) {
  if (action === "block") return "Blocked";
  if (action === "minimal") return "Minimal claim";
  if (action === "release") return "Released for checkout";
  if (action === "revoke") return "Revoke filed";
  return action;
}

const state = loadState();
if (state.rules.filter === "house") state.rules.filter = "network";

const els = {
  blocked: document.getElementById("statBlocked"),
  released: document.getElementById("statReleased"),
  revoked: document.getElementById("statRevoked"),
  decision: document.getElementById("privacyDecision"),
  log: document.getElementById("privacyLog"),
  logEmpty: document.getElementById("privacyLogEmpty"),
  disclaimer: document.getElementById("privacyDisclaimerModal"),
};

function renderWeek() {
  const counts = weekCounts(state.log);
  if (els.blocked) els.blocked.textContent = String(counts.blocked);
  if (els.released) els.released.textContent = String(counts.released);
  if (els.revoked) els.revoked.textContent = String(counts.revoked);
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

function renderVault() {
  Object.entries(state.vault).forEach(([key, value]) => {
    const input = document.getElementById(`vault-${key}`);
    if (input) input.value = value;
  });
}

function renderDecision(entry) {
  if (!els.decision) return;
  if (!entry) {
    els.decision.dataset.action = "";
    els.decision.innerHTML =
      '<p class="privacy-empty">Run a request to see the agent decide. Rules apply before anything leaves the vault.</p>';
    return;
  }
  els.decision.dataset.action = entry.action;
  const released = Object.keys(entry.released || {})
    .map((key) => `${key}: ${entry.released[key]}`)
    .join(" · ");
  els.decision.innerHTML = `
    <p class="privacy-kicker">${actionLabel(entry.action)}</p>
    <h3>${entry.headline}</h3>
    <p>${entry.body}</p>
    ${released ? `<p class="privacy-lead" style="margin:10px 0 0">Left the vault: ${released}</p>` : ""}
  `;
}

function renderLog() {
  if (!els.log) return;
  els.log.innerHTML = "";
  if (!state.log.length) {
    els.logEmpty?.classList.remove("hidden");
    return;
  }
  els.logEmpty?.classList.add("hidden");
  state.log.slice(0, 12).forEach((item) => {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${actionLabel(item.action)} · ${item.actor}`;
    const span = document.createElement("span");
    span.textContent = `${formatWhen(item.at)} — ${item.title}`;
    li.append(strong, span);
    els.log.appendChild(li);
  });
}

function persistAndPaint(lastDecision) {
  saveState(state);
  renderWeek();
  renderRules();
  renderVault();
  renderDecision(lastDecision);
  renderLog();
  renderHouseFilter();
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

function renderHouseLiveLog(recent) {
  const mount = document.getElementById("houseLiveLog");
  if (!mount) return;
  mount.innerHTML = "";
  (recent || []).slice(0, 6).forEach((item) => {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = "Blocked";
    const span = document.createElement("span");
    span.textContent = item.name || "";
    li.append(strong, span);
    mount.appendChild(li);
  });
}

function blocklistUrl(format) {
  const query = new URLSearchParams({
    shopping: state.rules.shopping,
    health: state.rules.health,
    identity: state.rules.identity,
  });
  if (format) query.set("format", format);
  return `${window.location.origin}/api/privacy-blocklist?${query.toString()}`;
}

function paintHouseSnapshot(data, extraMessage) {
  const running = Boolean(data?.running);
  window.__houseFilterRunning = running;
  const mode = state.rules.filter || "off";
  const label = document.getElementById("houseFilterStateLabel");
  if (label) {
    if (mode === "network") label.textContent = "On my network — apply the list, then check";
    else if (running && mode === "computer") label.textContent = "Live — this computer";
    else if (mode === "computer") label.textContent = "This computer — waiting to start";
    else label.textContent = "Filter off";
  }
  const liveCount = document.getElementById("houseLiveCount");
  if (liveCount) {
    liveCount.textContent = running ? `Live local blocks: ${data?.stats?.blocked ?? 0}` : "Live local blocks: 0";
    liveCount.classList.toggle("hidden", mode !== "computer");
  }
  document.getElementById("testHouseFilterBtn")?.classList.toggle("hidden", !(running && mode === "computer"));
  document.getElementById("houseComputerSteps")?.classList.toggle("hidden", mode !== "computer");
  document.getElementById("houseNetworkSteps")?.classList.toggle("hidden", mode !== "network");
  renderHouseLiveLog(mode === "computer" ? data?.recent : []);
  if (extraMessage) {
    setHouseStatus(extraMessage);
    return;
  }
  if (mode === "network") {
    setHouseStatus(
      "Your house list is ready. Add the link on your phone or router, then tap Check this network. This works for the live site — no Terminal."
    );
    return;
  }
  if (mode === "computer" && running) {
    const ip = (data.lan && data.lan[0]) || "this computer";
    setHouseStatus(`Local DNS is on. Set this computer to 127.0.0.1 or the router to ${ip}.`);
    return;
  }
  if (mode === "off") {
    setHouseStatus("House filter is off. Nothing is being blocked on the network.");
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
    if (state.rules.filter === "network") {
      paintHouseSnapshot({ running: false }, null);
      return null;
    }
    setHouseStatus("Could not reach the local house filter. For 100-user launch, choose On my network.");
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
    const data = await res.json();
    paintHouseSnapshot(data);
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

function downloadText(filename, body, type) {
  const blob = new Blob([body], { type: type || "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
    return;
  }
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
      const input = document.getElementById("houseBlocklistUrl");
      input?.select();
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
  document.getElementById("downloadHostsBtn")?.addEventListener("click", async () => {
    const domains = await currentBlockSet();
    downloadText("privacy-agent-hosts.txt", `${window.PrivacyHouseFilter.hostsFile(domains)}\n`);
    setHouseStatus("Saved a hosts file. Use this only if you prefer NextDNS, Pi-hole, or AdGuard Home.");
  });
  document.getElementById("downloadDomainsBtn")?.addEventListener("click", async () => {
    const domains = await currentBlockSet();
    downloadText("privacy-agent-domains.txt", `${window.PrivacyHouseFilter.domainFile(domains)}\n`);
    setHouseStatus("Saved one domain per line. Use this only if you prefer NextDNS or AdGuard Home.");
  });
  refreshHouseSnapshot().then(() => {
    if (state.rules.filter === "computer") applyFilterChoice("computer");
  });
  window.setInterval(refreshHouseSnapshot, 8000);
}

function runScenario(id) {
  const scenario = SCENARIOS.find((item) => item.id === id);
  if (!scenario) return;
  const decision = decide(scenario, state.rules, state.vault);
  const entry = {
    at: Date.now(),
    id: scenario.id,
    actor: scenario.actor,
    title: scenario.title,
    action: decision.action,
    headline: decision.headline,
    body: decision.body,
    released: decision.released,
  };
  state.log.unshift(entry);
  state.log = state.log.slice(0, 30);
  persistAndPaint(entry);
}

async function applyFilterChoice(value) {
  if (value === "off" || value === "network") {
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
    btn.addEventListener("click", () => {
      const group = btn.closest("[data-rule]");
      const rule = group?.getAttribute("data-rule");
      const value = btn.getAttribute("data-value");
      if (!rule || !value) return;
      state.rules[rule] = value;
      persistAndPaint(null);
      if (rule === "filter") applyFilterChoice(value);
    });
  });
}

function bindVault() {
  document.querySelectorAll("[data-vault]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.getAttribute("data-vault");
      if (!key) return;
      state.vault[key] = input.value.trim();
      saveState(state);
    });
  });
  document.getElementById("clearVaultBtn")?.addEventListener("click", () => {
    state.vault = { name: "", email: "", phone: "", city: "", interest: "" };
    persistAndPaint(null);
  });
  document.getElementById("resetDemoBtn")?.addEventListener("click", () => {
    const next = structuredClone(DEFAULT_STATE);
    state.rules = next.rules;
    state.vault = next.vault;
    state.log = [];
    persistAndPaint(null);
    applyFilterChoice("off");
  });
}

function bindScenarios() {
  const mount = document.getElementById("privacyScenarios");
  if (!mount) return;
  SCENARIOS.forEach((scenario) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<strong>${scenario.title}</strong><span>${scenario.actor}</span>`;
    btn.addEventListener("click", () => runScenario(scenario.id));
    mount.appendChild(btn);
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

async function ensureHubSession() {
  const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG || {};
  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) return;
  try {
    const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase.auth.getSession();
    if (!data?.session) window.location.replace("../");
  } catch {
    /* stay on the demo if auth cannot be checked */
  }
}

bindRules();
bindVault();
bindScenarios();
bindHouseFilter();
bindDisclaimer();
persistAndPaint(null);
ensureHubSession();
