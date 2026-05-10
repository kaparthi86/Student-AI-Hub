/** Same default as popup.js / background.js — respects saved Target URL from the popup. */
const DEFAULT_BASE_URL = "https://www.my-student-coach.com/";

chrome.storage.sync.get({ coachBaseUrl: DEFAULT_BASE_URL }, (cfg) => {
  const base = String(cfg.coachBaseUrl || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  try {
    window.location.replace(new URL(base).toString());
  } catch {
    window.location.replace(DEFAULT_BASE_URL);
  }
});
