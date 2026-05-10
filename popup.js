const DEFAULT_BASE_URL = "https://www.my-student-coach.com/";
const LOCAL_BASE_URL = "http://localhost:3001/";

const promptInput = document.getElementById("promptInput");
const baseUrlInput = document.getElementById("baseUrlInput");
const askBtn = document.getElementById("askBtn");
const openBtn = document.getElementById("openBtn");
const targetProdBtn = document.getElementById("targetProdBtn");
const targetLocalBtn = document.getElementById("targetLocalBtn");
const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function normalizeBase(raw) {
  const v = String(raw || "").trim() || DEFAULT_BASE_URL;
  const u = new URL(v);
  return u.toString();
}

function syncTargetButtons(base) {
  const normalized = String(base || "").trim();
  targetProdBtn.classList.toggle("is-active", normalized === DEFAULT_BASE_URL);
  targetLocalBtn.classList.toggle("is-active", normalized === LOCAL_BASE_URL);
}

function withConfig(cb) {
  chrome.storage.sync.get({ coachBaseUrl: DEFAULT_BASE_URL }, (cfg) => cb(cfg));
}

function saveBaseUrl(raw, savedMsg = "Saved") {
  try {
    const normalized = normalizeBase(raw);
    chrome.storage.sync.set({ coachBaseUrl: normalized }, () => {
      baseUrlInput.value = normalized;
      syncTargetButtons(normalized);
      setStatus(savedMsg);
      setTimeout(() => setStatus(""), 1200);
    });
  } catch {
    setStatus("Invalid URL");
  }
}

function openCoach(prompt) {
  withConfig((cfg) => {
    const base = String(cfg.coachBaseUrl || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
    let u;
    try {
      u = new URL(base);
    } catch {
      u = new URL(DEFAULT_BASE_URL);
    }
    if (prompt && String(prompt).trim()) u.searchParams.set("q", String(prompt).trim().slice(0, 4000));
    chrome.tabs.create({ url: u.toString() });
    window.close();
  });
}

withConfig((cfg) => {
  const current = String(cfg.coachBaseUrl || DEFAULT_BASE_URL);
  baseUrlInput.value = current;
  syncTargetButtons(current);
});

askBtn.addEventListener("click", () => openCoach(promptInput.value));
openBtn.addEventListener("click", () => openCoach(""));
baseUrlInput.addEventListener("change", () => saveBaseUrl(baseUrlInput.value));
targetProdBtn.addEventListener("click", () => saveBaseUrl(DEFAULT_BASE_URL, "Using prod"));
targetLocalBtn.addEventListener("click", () => saveBaseUrl(LOCAL_BASE_URL, "Using localhost"));
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    openCoach(promptInput.value);
  }
});
