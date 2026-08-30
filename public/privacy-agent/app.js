const STORAGE_KEY = "aihub.privacy-agent.v1";
const DISCLAIMER_KEY = "aihub.privacy-agent.disclaimer.v1";

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

function bindRules() {
  document.querySelectorAll("[data-rule] button[data-value]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest("[data-rule]");
      const rule = group?.getAttribute("data-rule");
      const value = btn.getAttribute("data-value");
      if (!rule || !value) return;
      state.rules[rule] = value;
      persistAndPaint(null);
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
bindDisclaimer();
persistAndPaint(null);
ensureHubSession();
