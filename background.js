const MENU_ID = "student-coach-ask-selection";
const DEFAULT_BASE_URL = "https://www.my-student-coach.com/";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Ask Student Coach",
    contexts: ["selection"],
  });
});

function openCoachWithPrompt(rawPrompt) {
  const prompt = String(rawPrompt || "").trim();
  if (!prompt) return;
  chrome.storage.sync.get({ coachBaseUrl: DEFAULT_BASE_URL }, (cfg) => {
    const base = String(cfg.coachBaseUrl || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
    let url;
    try {
      url = new URL(base);
    } catch {
      url = new URL(DEFAULT_BASE_URL);
    }
    url.searchParams.set("q", prompt.slice(0, 4000));
    chrome.tabs.create({ url: url.toString() });
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  openCoachWithPrompt(info.selectionText || "");
});
