/** Ask-tab image attach (VQA / multimodal). Set `true` to show UI and send images; keep `false` to mute. */
const LEARN_VISION_ENABLED = false;

const authCard = document.getElementById("authCard");
const appCard = document.getElementById("appCard");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const authStatus = document.getElementById("authStatus");
const userName = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const prefRestoreSessions = document.getElementById("prefRestoreSessions");
const toastStack = document.getElementById("toastStack");

const panelChat = document.getElementById("panelChat");
const panelCode = document.getElementById("panelCode");
const panelNotebook = document.getElementById("panelNotebook");

const chatSearchShell = document.getElementById("chatSearchShell");
const chatFollowupChips = document.getElementById("chatFollowupChips");
const chatAnswerShell = document.getElementById("chatAnswerShell");
const chatSearchInput = document.getElementById("chatSearchInput");
const chatSearchSubmit = document.getElementById("chatSearchSubmit");
const chatThread = document.getElementById("chatThread");
const chatFollowupInput = document.getElementById("chatFollowupInput");
const chatFollowupSubmit = document.getElementById("chatFollowupSubmit");
const apiStatus = document.getElementById("apiStatus");
const learnChatImageInput = document.getElementById("learnChatImageInput");
const chatHeroAttachBtn = document.getElementById("chatHeroAttachBtn");
const chatFollowupAttachBtn = document.getElementById("chatFollowupAttachBtn");
const chatHeroAttachPreview = document.getElementById("chatHeroAttachPreview");
const chatFollowupAttachPreview = document.getElementById("chatFollowupAttachPreview");

const codeSearchShell = document.getElementById("codeSearchShell");
const codeAnswerShell = document.getElementById("codeAnswerShell");
const codeSearchInput = document.getElementById("codeSearchInput");
const codeSearchSubmit = document.getElementById("codeSearchSubmit");
const codeThread = document.getElementById("codeThread");
const codeFollowupInput = document.getElementById("codeFollowupInput");
const codeFollowupSubmit = document.getElementById("codeFollowupSubmit");
const codeStatus = document.getElementById("codeStatus");

const docFileInput = document.getElementById("docFileInput");
const docAnalyzeBtn = document.getElementById("docAnalyzeBtn");
const docFileMeta = document.getElementById("docFileMeta");
const notebookThread = document.getElementById("notebookThread");
const notebookStatus = document.getElementById("notebookStatus");

let mainTab = "chat";
let supabaseClient = null;

async function authHeaders(base = {}) {
  const h = { ...base };
  try {
    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getSession();
      const t = data?.session?.access_token;
      if (t) h.Authorization = `Bearer ${t}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}

const chatHistory = [];
const codeHistory = [];
const FEEDBACK_REASONS = ["too_vague", "incorrect", "too_long", "not_my_level", "other"];
const USER_PREFS_KEY = "student_ai_user_prefs_v1";
const CHAT_SESSION_KEY = "student_ai_sessions_v1";
const DEFAULT_PAGE_HINT_DISMISSED_KEY = "student_ai_default_page_hint_dismissed_v1";

let chatSessionOpen = false;
let codeSessionOpen = false;
let defaultPageHintOfferedThisLoad = false;

/** @type {{ mime: string, base64: string, dataUrl: string } | null} */
let learnChatVisionAttachment = null;

function clearLearnChatVisionAttachment() {
  learnChatVisionAttachment = null;
  [chatHeroAttachPreview, chatFollowupAttachPreview].forEach((el) => {
    if (!el) return;
    el.replaceChildren();
    el.classList.add("hidden");
  });
}

function updateLearnChatAttachPreview() {
  [chatHeroAttachPreview, chatFollowupAttachPreview].forEach((el) => {
    if (!el) return;
    el.replaceChildren();
    if (!learnChatVisionAttachment) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const wrap = document.createElement("span");
    wrap.className = "learn-chat-attach-thumb-wrap";
    const img = document.createElement("img");
    img.className = "learn-chat-attach-thumb";
    img.src = learnChatVisionAttachment.dataUrl;
    img.alt = "Attached preview";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "learn-chat-attach-remove";
    rm.setAttribute("aria-label", "Remove image");
    rm.textContent = "\u00d7";
    rm.addEventListener("click", (e) => {
      e.preventDefault();
      clearLearnChatVisionAttachment();
    });
    wrap.appendChild(img);
    wrap.appendChild(rm);
    el.appendChild(wrap);
  });
}

/**
 * Resize to max side ~1280px and JPEG re-encode to keep JSON payloads reasonable.
 * @returns {Promise<{ mime: string, base64: string, dataUrl: string }>}
 */
function prepareImageForLearnChat(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("Choose an image file (JPEG, PNG, GIF, or WebP)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const url = reader.result;
      if (typeof url !== "string") {
        reject(new Error("Could not read the file."));
        return;
      }
      const image = new Image();
      image.onload = () => {
        const maxSide = 1280;
        let { width, height } = image;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxSide) / width));
            width = maxSide;
          } else {
            width = Math.max(1, Math.round((width * maxSide) / height));
            height = maxSide;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not process image."));
              return;
            }
            const fr = new FileReader();
            fr.onload = () => {
              const dataUrl = fr.result;
              if (typeof dataUrl !== "string") {
                reject(new Error("Could not process image."));
                return;
              }
              const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
              if (!m) {
                reject(new Error("Could not process image."));
                return;
              }
              resolve({ mime: m[1], base64: m[2], dataUrl });
            };
            fr.onerror = () => reject(new Error("Could not process image."));
            fr.readAsDataURL(blob);
          },
          "image/jpeg",
          0.88,
        );
      };
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = url;
    };
    reader.readAsDataURL(file);
  });
}

function formatChatErrorForUi(err) {
  const msg = err && err.message ? String(err.message) : "Request failed";
  if (/did not match the expected pattern/i.test(msg)) {
    return (
      `${msg}\n\n` +
      "If this persists in Safari, try Chrome or Firefox. Also confirm the app is opened from your dev server (http://localhost:port), not a file:// page. " +
      "Otherwise check server `.env`: HF_MODEL (valid Hub id), HF_CHAT_URL, and HF_API_TOKEN (Inference Providers)."
    );
  }
  return msg;
}

/** Starter prompts for in-chat follow-up chips (uses chat history). */
const CHAT_FOLLOWUP_STARTER_PROMPTS = {
  summarize:
    "Summarize your last answer in short bullet points. Highlight the key terms I should remember.\n\n",
  quiz:
    "Based on our conversation so far, give me a short quiz: questions, answer choices, and correct answers with brief explanations.\n\n",
  steps:
    "Explain that again step-by-step, with smaller steps and a simple example where it helps.\n\n",
};

/**
 * Starter chips send the prompt immediately (same path as Ask / Send).
 * Optional `customStarters`: map of data-starter key -> handler (runs instead of sending a prompt).
 */
function wireStarterChipsAsSend(container, promptMap, sendFn, busyButton, customStarters = null) {
  if (!container || !promptMap || typeof sendFn !== "function") return;
  container.addEventListener("click", (e) => {
    const chip = e.target.closest(".starter-chip[data-starter]");
    if (!chip || !container.contains(chip)) return;
    if (busyButton?.disabled) return;
    const key = chip.getAttribute("data-starter");
    if (customStarters && typeof customStarters[key] === "function") {
      customStarters[key]();
      return;
    }
    const prompt = promptMap[key];
    if (typeof prompt !== "string") return;
    sendFn(prompt);
  });
}

function stopReadAloud() {
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

function getLastAssistantMarkdownFromHistory(history) {
  if (!Array.isArray(history)) return "";
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    if (m && m.role === "assistant" && typeof m.content === "string") {
      const t = m.content.trim();
      if (t) return m.content;
    }
  }
  return "";
}

/** Read-aloud chip: Web Speech API, last assistant reply only. Tap again while playing to stop. */
function readLastAssistantAloud() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    showToast("Read aloud is not supported in this browser.");
    return;
  }
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    stopReadAloud();
    showToast("Stopped");
    return;
  }
  const raw = getLastAssistantMarkdownFromHistory(chatHistory);
  if (!String(raw).trim()) {
    showToast("No assistant reply to read yet.");
    return;
  }
  const { plain } = getAssistantCopyFormats(raw);
  const text = String(plain || "").trim();
  if (!text) {
    showToast("Nothing to read.");
    return;
  }
  const maxChars = 32000;
  const toSpeak = text.length > maxChars ? `${text.slice(0, maxChars)}\n\n(Truncated for speech.)` : text;
  const u = new SpeechSynthesisUtterance(toSpeak);
  u.rate = 1;
  u.onerror = () => showToast("Speech playback failed.");
  window.speechSynthesis.speak(u);
}

function normalizeStudyMode(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return v === "quiz" ? v : "explain";
}

function defaultPrefs() {
  return {
    restoreSessions: true,
  };
}

function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_PREFS_KEY) || "{}");
    const d = defaultPrefs();
    return {
      restoreSessions: parsed.restoreSessions !== false,
    };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(prefs) {
  localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
}

function showToast(msg) {
  if (!toastStack) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = String(msg || "");
  toastStack.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2600);
}

function saveSessionState() {
  try {
    const chatOut = LEARN_VISION_ENABLED
      ? chatHistory
      : chatHistory.map((m) => {
          if (!m || typeof m !== "object") return m;
          const { imageBase64, imageMime, ...rest } = m;
          return rest;
        });
    const payload = {
      chatHistory: chatOut,
      codeHistory,
      chatSessionOpen,
      codeSessionOpen,
    };
    localStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota issues */
  }
}

function renderThreadFromHistory(container, history, mode, studyMode) {
  if (!container) return;
  container.innerHTML = "";
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    const content = String(item.content || "");
    let imageDataUrl;
    if (LEARN_VISION_ENABLED && role === "user" && item.imageMime && item.imageBase64) {
      imageDataUrl = `data:${item.imageMime};base64,${item.imageBase64}`;
    }
    appendBubble(container, role, content, { mode, studyMode, imageDataUrl });
  }
}

function restoreSessionStateIfEnabled() {
  const prefs = loadPrefs();
  if (!prefs.restoreSessions) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_SESSION_KEY) || "{}");
    if (Array.isArray(parsed.chatHistory)) {
      chatHistory.splice(
        0,
        chatHistory.length,
        ...parsed.chatHistory.filter(
          (x) =>
            x &&
            typeof x.content === "string" &&
            (x.content.trim().length > 0 || (typeof x.imageBase64 === "string" && x.imageBase64.length > 40 && x.imageMime)),
        ),
      );
      if (!LEARN_VISION_ENABLED) {
        chatHistory.forEach((m) => {
          if (!m || typeof m !== "object") return;
          delete m.imageBase64;
          delete m.imageMime;
        });
      }
    }
    if (Array.isArray(parsed.codeHistory)) {
      codeHistory.splice(0, codeHistory.length, ...parsed.codeHistory.filter((x) => x && typeof x.content === "string"));
    }
    chatSessionOpen = parsed.chatSessionOpen === true || chatHistory.length > 0;
    codeSessionOpen = parsed.codeSessionOpen === true || codeHistory.length > 0;
    renderThreadFromHistory(chatThread, chatHistory, "learn", "explain");
    renderThreadFromHistory(codeThread, codeHistory, "code", "explain");
  } catch {
    /* ignore malformed storage */
  }
}

function initMarkdown() {
  if (typeof marked === "undefined") return;
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
  });
}

function normalizeCopyPlain(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Readable plain text from sanitized HTML (no markdown #, *, etc.). */
function htmlToCleanPlain(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return normalizeCopyPlain(div.innerText || div.textContent || "");
}

/**
 * Plain text + optional HTML for clipboard. Plain is always clean for pasting into notes/email.
 * @returns {{ plain: string, html?: string }}
 */
function getAssistantCopyFormats(markdownRaw) {
  const rendered = renderAssistantHtml(markdownRaw);
  if ("html" in rendered) {
    return { plain: htmlToCleanPlain(rendered.html), html: rendered.html };
  }
  if (typeof marked !== "undefined") {
    try {
      const html = marked.parse(String(rendered.plain));
      const safe =
        typeof DOMPurify !== "undefined"
          ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
          : html;
      return { plain: htmlToCleanPlain(safe), html: safe };
    } catch {
      /* fall through */
    }
  }
  return { plain: normalizeCopyPlain(rendered.plain) };
}

async function copyPlainText(text) {
  const value = String(text);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy assistant reply: clean plain text; rich HTML too when the browser supports it. */
async function copyAssistantOutput(markdownRaw) {
  const { plain, html } = getAssistantCopyFormats(markdownRaw);
  try {
    if (html && navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      const htmlDoc = `<!DOCTYPE html><html><body>${html}</body></html>`;
      // WebKit (Safari) often expects Promise<Blob> entries; bare Blobs can throw
      // "The string did not match the expected pattern."
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": Promise.resolve(new Blob([plain], { type: "text/plain;charset=utf-8" })),
          "text/html": Promise.resolve(new Blob([htmlDoc], { type: "text/html;charset=utf-8" })),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through */
  }
  return copyPlainText(plain);
}

/** @returns {{ html: string } | { plain: string }} */
function renderAssistantHtml(text) {
  const raw = String(text);
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    return { plain: raw };
  }
  try {
    const html = marked.parse(raw);
    const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    return { html: clean };
  } catch {
    return { plain: raw };
  }
}

function setMainTab(next) {
  mainTab = next === "code" ? "code" : next === "notebook" ? "notebook" : "chat";
  if (mainTab !== "chat") stopReadAloud();
  if (LEARN_VISION_ENABLED && mainTab !== "chat") clearLearnChatVisionAttachment();
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === mainTab);
  });
  panelChat.classList.toggle("hidden", mainTab !== "chat");
  panelCode.classList.toggle("hidden", mainTab !== "code");
  panelNotebook.classList.toggle("hidden", mainTab !== "notebook");
}

function syncLearnLayout() {
  const showThread = chatSessionOpen || chatHistory.length > 0;
  chatSearchShell.classList.toggle("hidden", showThread);
  chatAnswerShell.classList.toggle("hidden", !showThread);
}

function syncCodeLayout() {
  const showThread = codeSessionOpen || codeHistory.length > 0;
  codeSearchShell.classList.toggle("hidden", showThread);
  codeAnswerShell.classList.toggle("hidden", !showThread);
}

function wireAssistantCopy(bubble, rawText) {
  const btn = bubble.querySelector(".bubble-copy");
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  /* Streaming UI leaves Copy disabled; cloneNode copies that, which blocks clicks. */
  fresh.disabled = false;
  fresh.removeAttribute("disabled");
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyAssistantOutput(rawText);
    const prev = fresh.textContent;
    fresh.textContent = ok ? "Copied!" : "Failed";
    setTimeout(() => {
      fresh.textContent = prev;
    }, 2000);
  });
}

async function submitAssistantFeedback(payload) {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = "Could not submit feedback.";
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

function mountAssistantFeedback(bubble, rawText) {
  bubble.querySelectorAll(".assistant-feedback").forEach((el) => el.remove());
  const mode = bubble.dataset.mode || "learn";
  const studyMode = bubble.dataset.studyMode || "explain";

  const wrap = document.createElement("div");
  wrap.className = "assistant-feedback";
  const prompt = document.createElement("span");
  prompt.className = "assistant-feedback-label";
  prompt.textContent = "Was this helpful?";
  const up = document.createElement("button");
  up.type = "button";
  up.className = "assistant-feedback-btn";
  up.textContent = "Helpful";
  const down = document.createElement("button");
  down.type = "button";
  down.className = "assistant-feedback-btn";
  down.textContent = "Not helpful";
  const status = document.createElement("span");
  status.className = "assistant-feedback-status";
  wrap.appendChild(prompt);
  wrap.appendChild(up);
  wrap.appendChild(down);
  wrap.appendChild(status);

  const reasons = document.createElement("div");
  reasons.className = "assistant-feedback-reasons hidden";
  reasons.innerHTML = FEEDBACK_REASONS.map((r) => `<button type="button" class="assistant-feedback-reason" data-reason="${r}">${r.replace(/_/g, " ")}</button>`).join("");
  wrap.appendChild(reasons);
  bubble.appendChild(wrap);

  const lock = (txt) => {
    up.disabled = true;
    down.disabled = true;
    reasons.querySelectorAll("button").forEach((b) => (b.disabled = true));
    status.textContent = txt;
  };

  up.addEventListener("click", async () => {
    up.disabled = true;
    down.disabled = true;
    try {
      await submitAssistantFeedback({
        type: "message_feedback",
        rating: 1,
        reason: "helpful",
        mode,
        studyMode,
        assistantMessage: String(rawText || "").slice(0, 8000),
        createdAt: new Date().toISOString(),
      });
      lock("Thanks!");
    } catch (e) {
      status.textContent = e.message || "Failed";
      up.disabled = false;
      down.disabled = false;
    }
  });

  down.addEventListener("click", () => {
    reasons.classList.remove("hidden");
    status.textContent = "Select a reason";
  });

  reasons.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-reason]");
    if (!btn || !reasons.contains(btn)) return;
    const reason = btn.getAttribute("data-reason") || "other";
    try {
      await submitAssistantFeedback({
        type: "message_feedback",
        rating: -1,
        reason,
        mode,
        studyMode,
        assistantMessage: String(rawText || "").slice(0, 8000),
        createdAt: new Date().toISOString(),
      });
      lock("Thanks for the feedback");
    } catch (e2) {
      status.textContent = e2.message || "Failed";
    }
  });
}

function fillAssistantBubbleBody(bubble, text) {
  bubble.querySelectorAll(".bubble-text").forEach((el) => el.remove());
  const rendered = renderAssistantHtml(text);
  if ("plain" in rendered) {
    const pre = document.createElement("pre");
    pre.className = "bubble-text";
    pre.textContent = rendered.plain;
    bubble.appendChild(pre);
  } else {
    const body = document.createElement("div");
    body.className = "bubble-text bubble-md";
    body.innerHTML = rendered.html;
    bubble.appendChild(body);
  }
  wireAssistantCopy(bubble, text);
  mountAssistantFeedback(bubble, text);
}

/** @returns {{ wrap: HTMLDivElement, bubble: HTMLDivElement }} */
function appendBubble(container, role, text, meta = {}) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (meta && typeof meta === "object") {
    if (meta.mode) bubble.dataset.mode = String(meta.mode);
    if (meta.studyMode) bubble.dataset.studyMode = String(meta.studyMode);
  }

  if (role === "user") {
    const label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = "You";
    bubble.appendChild(label);
    if (meta.imageDataUrl) {
      const fig = document.createElement("div");
      fig.className = "bubble-user-image";
      const img = document.createElement("img");
      img.src = meta.imageDataUrl;
      img.alt = "Attached";
      img.loading = "lazy";
      img.decoding = "async";
      fig.appendChild(img);
      bubble.appendChild(fig);
    }
    const trimmed = String(text || "").trim();
    if (trimmed) {
      const pre = document.createElement("pre");
      pre.className = "bubble-text";
      pre.textContent = text;
      bubble.appendChild(pre);
    } else if (meta.imageDataUrl) {
      const cap = document.createElement("p");
      cap.className = "bubble-text muted";
      cap.style.margin = "0";
      cap.style.fontSize = "13px";
      cap.textContent = "Attached image";
      bubble.appendChild(cap);
    }
  } else {
    const head = document.createElement("div");
    head.className = "bubble-head";
    const label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = "Assistant";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "bubble-copy";
    copyBtn.setAttribute("aria-label", "Copy assistant response");
    copyBtn.textContent = "Copy";
    head.appendChild(label);
    head.appendChild(copyBtn);
    bubble.appendChild(head);
    fillAssistantBubbleBody(bubble, text);
  }

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return { wrap, bubble };
}

/**
 * Assistant row while streaming: render Markdown the same way as the final bubble (no raw # / * then jump).
 */
function startStreamingAssistantBubble(container) {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble bubble--streaming";

  const head = document.createElement("div");
  head.className = "bubble-head";
  const label = document.createElement("div");
  label.className = "bubble-label";
  label.textContent = "Assistant";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "bubble-copy";
  copyBtn.setAttribute("aria-label", "Copy assistant response");
  copyBtn.textContent = "Copy";
  copyBtn.disabled = true;
  head.appendChild(label);
  head.appendChild(copyBtn);
  bubble.appendChild(head);

  const body = document.createElement("div");
  body.className = "bubble-text bubble-md bubble-md--streaming";
  body.setAttribute("aria-busy", "true");
  bubble.appendChild(body);
  wrap.appendChild(bubble);
  container.appendChild(wrap);

  const scroll = () => {
    container.scrollTop = container.scrollHeight;
  };

  return {
    setStreamingText(text) {
      const rendered = renderAssistantHtml(text);
      if ("plain" in rendered) {
        body.textContent = rendered.plain;
      } else {
        body.innerHTML = rendered.html;
      }
      scroll();
    },
    finalize(markdownRaw) {
      body.remove();
      fillAssistantBubbleBody(bubble, markdownRaw);
      scroll();
    },
    showError(markdownRaw) {
      body.remove();
      fillAssistantBubbleBody(bubble, markdownRaw);
      scroll();
    },
    remove() {
      wrap.remove();
    },
    wrap,
    bubble,
  };
}

/**
 * OpenAI-compatible `choices[].delta`: `content` string or parts; some HF / reasoning models use
 * `reasoning_content`, `text`, or `input_text` instead of (or before) `content`.
 */
function extractChatDeltaText(delta) {
  if (!delta || typeof delta !== "object") return "";
  const bits = [];
  const reasoning = delta.reasoning_content;
  if (typeof reasoning === "string" && reasoning.length) bits.push(reasoning);
  const c = delta.content;
  if (typeof c === "string" && c.length) bits.push(c);
  else if (Array.isArray(c)) {
    for (const part of c) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && typeof part.text === "string") bits.push(part.text);
      if (part.type === "input_text" && typeof part.text === "string") bits.push(part.text);
    }
  }
  const legacy = delta.text;
  if (typeof legacy === "string" && legacy.length) bits.push(legacy);
  const inputText = delta.input_text;
  if (typeof inputText === "string" && inputText.length) bits.push(inputText);
  return bits.join("");
}

/** Some proxies put assistant text on `choices[].text` or `choices[].message` instead of `delta`. */
function extractStreamChoiceText(choice) {
  if (!choice || typeof choice !== "object") return "";
  const fromDelta = extractChatDeltaText(choice.delta);
  if (fromDelta.length) return fromDelta;
  if (typeof choice.text === "string" && choice.text.length) return choice.text;
  const msg = choice.message;
  if (msg && typeof msg.content === "string" && msg.content.length) return msg.content;
  return "";
}

function applyStreamDelta(json, full, onDelta) {
  const err = json.error;
  if (err) {
    const msg = typeof err === "string" ? err : err.message || JSON.stringify(err);
    throw new Error(msg);
  }
  const piece = extractStreamChoiceText(json.choices?.[0]);
  if (piece.length === 0) return full;
  const next = full + piece;
  onDelta(next);
  return next;
}

/**
 * Reads OpenAI-style SSE from /api/chat (stream: true). Invokes onDelta with the full text so far.
 * @returns {Promise<string>} final concatenated assistant text
 */
async function consumeChatSseStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = lineBuf.indexOf("\n")) >= 0) {
      const rawLine = lineBuf.slice(0, nl);
      lineBuf = lineBuf.slice(nl + 1);
      const line = rawLine.replace(/\r$/, "");
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).replace(/^\s*/, "");
      if (!payload || payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      full = applyStreamDelta(json, full, onDelta);
    }
  }
  if (lineBuf.trim()) {
    const line = lineBuf.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      const payload = line.slice(5).replace(/^\s*/, "");
      if (payload && payload !== "[DONE]") {
        try {
          const json = JSON.parse(payload);
          full = applyStreamDelta(json, full, onDelta);
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    }
  }
  return full;
}

/** @returns {Promise<boolean>} true if the exchange completed without a client-side failure. */
async function sendChatMessage(mode, message, history, threadEl, statusEl, sendBtn, studyMode = "explain", visionAttachment = null) {
  stopReadAloud();
  const attach = LEARN_VISION_ENABLED ? visionAttachment : null;
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed && !attach) return false;

  appendBubble(threadEl, "user", trimmed, { imageDataUrl: attach?.dataUrl });

  const historyForApi =
    mode === "learn" && LEARN_VISION_ENABLED
      ? history.map((m) => {
          if (!m || typeof m !== "object") return { role: "user", content: "" };
          const o = { role: m.role, content: typeof m.content === "string" ? m.content : "" };
          if (m.role === "user" && m.imageMime && m.imageBase64) {
            o.imageMime = m.imageMime;
            o.imageBase64 = m.imageBase64;
          }
          return o;
        })
      : history.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : "",
        }));

  const chatBody = {
    mode,
    message: trimmed,
    history: historyForApi,
    studyMode: normalizeStudyMode(studyMode),
    stream: true,
  };
  if (mode === "learn" && attach) {
    chatBody.imageBase64 = attach.base64;
    chatBody.imageMime = attach.mime;
  }

  sendBtn.disabled = true;
  statusEl.textContent = "Thinking...";

  const streamUi = startStreamingAssistantBubble(threadEl);
  streamUi.bubble.dataset.mode = mode;
  streamUi.bubble.dataset.studyMode = normalizeStudyMode(studyMode);
  let rafId = 0;
  let pendingFull = "";

  const flushPending = () => {
    rafId = 0;
    streamUi.setStreamingText(pendingFull);
  };

  const scheduleDelta = (full) => {
    pendingFull = full;
    if (rafId) return;
    rafId = requestAnimationFrame(flushPending);
  };

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(chatBody),
    });

    const ct = (response.headers.get("content-type") || "").toLowerCase();

    if (!response.ok) {
      streamUi.remove();
      if (ct.includes("application/json")) {
        const data = await response.json();
        throw new Error(data.error || "Request failed");
      }
      throw new Error(`Request failed (${response.status})`);
    }

    if (!response.body || !ct.includes("text/event-stream")) {
      streamUi.remove();
      let output = "No response.";
      try {
        const data = await response.json();
        output = typeof data.output === "string" && data.output.trim() ? data.output.trim() : output;
      } catch {
        try {
          const t = await response.text();
          if (t.trim()) output = t.trim().slice(0, 2000);
        } catch {
          /* keep default */
        }
      }
      appendBubble(threadEl, "assistant", output, { mode, studyMode: normalizeStudyMode(studyMode) });
      const userRow = { role: "user", content: trimmed };
      if (attach) {
        userRow.imageMime = attach.mime;
        userRow.imageBase64 = attach.base64;
      }
      history.push(userRow);
      history.push({ role: "assistant", content: output });
      saveSessionState();
      statusEl.textContent = "Ready";
      return true;
    }

    statusEl.textContent = "Streaming...";
    const fullOut = await consumeChatSseStream(response, scheduleDelta);

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    const finalText =
      String(fullOut || "").trim() ||
      "No assistant text arrived in the stream. This is usually not a token read error: invalid or empty model output, or an SSE shape we did not parse. Check Render **HF_API_TOKEN**, **HF_MODEL** (Inference Providers routing suffix, e.g. `:fastest`), and **HF_CHAT_URL**; open `/api/health` to confirm `hfConfigured` is true.";
    streamUi.setStreamingText(finalText);
    streamUi.finalize(finalText);

    const userRow = { role: "user", content: trimmed };
    if (attach) {
      userRow.imageMime = attach.mime;
      userRow.imageBase64 = attach.base64;
    }
    history.push(userRow);
    history.push({ role: "assistant", content: finalText });
    saveSessionState();
    statusEl.textContent = "Ready";
    return true;
  } catch (error) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (streamUi.bubble.isConnected) {
      streamUi.showError(`Error: ${formatChatErrorForUi(error)}`);
    } else {
      appendBubble(threadEl, "assistant", `Error: ${formatChatErrorForUi(error)}`, {
        mode,
        studyMode: normalizeStudyMode(studyMode),
      });
    }
    statusEl.textContent = "Failed";
    return false;
  } finally {
    sendBtn.disabled = false;
  }
}

function isStandaloneWebAppDisplay() {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* ignore */
  }
  return window.navigator.standalone === true;
}

function hubPageUrlForBookmark() {
  try {
    if (window.location.protocol === "file:") return "";
    return `${window.location.origin}${window.location.pathname || "/"}`;
  } catch {
    return "";
  }
}

function maybeOfferDefaultPageHint() {
  if (defaultPageHintOfferedThisLoad) return;
  const modal = document.getElementById("defaultPageHintModal");
  if (!modal || !appCard || appCard.classList.contains("hidden")) return;
  if (localStorage.getItem(DEFAULT_PAGE_HINT_DISMISSED_KEY) === "1") return;
  if (isStandaloneWebAppDisplay()) return;
  if (window.location.protocol === "file:") return;

  defaultPageHintOfferedThisLoad = true;
  const urlField = document.getElementById("defaultPageHintUrlField");
  const steps = document.getElementById("defaultPageHintSteps");
  const showStepsBtn = document.getElementById("showDefaultPageStepsBtn");
  if (urlField) urlField.value = hubPageUrlForBookmark();

  window.setTimeout(() => {
    if (!modal.classList.contains("hidden")) return;
    modal.classList.remove("hidden");
    showStepsBtn?.focus();
  }, 700);
}

function hideDefaultPageHintModal(saveDismiss) {
  const modal = document.getElementById("defaultPageHintModal");
  const steps = document.getElementById("defaultPageHintSteps");
  if (saveDismiss) localStorage.setItem(DEFAULT_PAGE_HINT_DISMISSED_KEY, "1");
  modal?.classList.add("hidden");
  steps?.classList.add("hidden");
  const showStepsBtn = document.getElementById("showDefaultPageStepsBtn");
  if (showStepsBtn) showStepsBtn.textContent = "Yes, show me how";
}

function wireDefaultPageHintModal() {
  const modal = document.getElementById("defaultPageHintModal");
  const steps = document.getElementById("defaultPageHintSteps");
  const showStepsBtn = document.getElementById("showDefaultPageStepsBtn");
  const dismissBtn = document.getElementById("dismissDefaultPageHintBtn");
  const closeBtn = document.getElementById("closeDefaultPageHintBtn");
  const copyBtn = document.getElementById("copyDefaultPageUrlBtn");
  const urlField = document.getElementById("defaultPageHintUrlField");

  showStepsBtn?.addEventListener("click", () => {
    if (!steps) return;
    const opening = steps.classList.contains("hidden");
    if (opening) {
      steps.classList.remove("hidden");
      showStepsBtn.textContent = "Hide steps";
      urlField?.select();
    } else {
      steps.classList.add("hidden");
      showStepsBtn.textContent = "Yes, show me how";
    }
  });

  dismissBtn?.addEventListener("click", () => hideDefaultPageHintModal(true));
  closeBtn?.addEventListener("click", () => hideDefaultPageHintModal(true));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hideDefaultPageHintModal(true);
  });

  copyBtn?.addEventListener("click", async () => {
    const t = urlField?.value || hubPageUrlForBookmark();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      showToast("Address copied");
    } catch {
      urlField?.select();
      showToast("Select the field and copy (?C / Ctrl+C)");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal || modal.classList.contains("hidden")) return;
    hideDefaultPageHintModal(true);
  });
}

function showApp(session) {
  const metadata = session?.user?.user_metadata || {};
  const email = session?.user?.email || "";
  const display = metadata.full_name || metadata.name || email.split("@")[0] || "Student";
  userName.textContent = display;
  authCard.classList.add("hidden");
  appCard.classList.remove("hidden");
  maybeOfferDefaultPageHint();
}

function showAuth(message = "") {
  authCard.classList.remove("hidden");
  appCard.classList.add("hidden");
  authStatus.textContent = message;
}

/** OAuth return URL without a #fragment (Supabase redirect allowlists match origin/path/query). */
function getOAuthRedirectTo() {
  if (window.location.protocol === "file:") return null;
  const path = window.location.pathname || "/";
  return `${window.location.origin}${path}${window.location.search}`;
}

function describeAuthFailure(err) {
  const msg = err && err.message ? String(err.message) : String(err || "");
  if (/did not match the expected pattern/i.test(msg)) {
    const allowed = getOAuthRedirectTo() || window.location.origin || "(your app URL)";
    return (
      "Sign-in blocked (URL pattern). In Supabase: Authentication ? URL Configuration ? Redirect URLs, add exactly: " +
      allowed +
      " (include the correct port and path). Or use a wildcard like http://localhost:3001/** for local dev."
    );
  }
  return msg || "Unknown error";
}

async function initAuth() {
  const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG || {};
  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
    showAuth("Set Supabase URL and anon key in public/config.js to enable Google login.");
    googleLoginBtn.disabled = true;
    return;
  }

  try {
    new URL(String(supabaseUrl).trim());
  } catch {
    showAuth("Invalid supabaseUrl in public/config.js (must look like https://xxxx.supabase.co).");
    googleLoginBtn.disabled = true;
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    showAuth(`Could not start auth: ${describeAuthFailure(err)}`);
    googleLoginBtn.disabled = true;
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) showAuth(`Auth error: ${describeAuthFailure(error)}`);
    else if (data.session) showApp(data.session);
  } catch (err) {
    showAuth(describeAuthFailure(err));
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session);
    else showAuth();
  });
}

googleLoginBtn.addEventListener("click", async () => {
  if (!supabaseClient) return;
  const redirectTo = getOAuthRedirectTo();
  if (!redirectTo) {
    authStatus.textContent =
      "Sign-in needs http:// or https:// (open the app from your dev server, not a file:// page).";
    return;
  }
  authStatus.textContent = "Opening Google login...";
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) authStatus.textContent = `Login failed: ${describeAuthFailure(error)}`;
  } catch (err) {
    authStatus.textContent = describeAuthFailure(err);
  }
});

logoutBtn.addEventListener("click", async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setMainTab(tab.dataset.tab));
});

function wireSearchFlow({
  searchInput,
  searchSubmit,
  followupInput,
  followupSubmit,
  mode,
  history,
  threadEl,
  statusEl,
  onFirstSend,
  getVisionAttachment,
  clearVisionAttachment,
} = {}) {
  const run = (raw, activeBtn) => {
    const attach = typeof getVisionAttachment === "function" ? getVisionAttachment() : null;
    const msg = typeof raw === "string" ? raw : "";
    const trimmed = msg.trim();
    if (!trimmed && !attach) return;
    if (typeof clearVisionAttachment === "function") clearVisionAttachment();
    if (!history.length) onFirstSend();
    void sendChatMessage(mode, trimmed, history, threadEl, statusEl, activeBtn, "explain", attach);
    followupInput.value = "";
    followupInput.focus();
  };

  searchSubmit.addEventListener("click", () => {
    const msg = searchInput.value;
    searchInput.value = "";
    run(msg, searchSubmit);
  });

  followupSubmit.addEventListener("click", () => {
    run(followupInput.value, followupSubmit);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      searchSubmit.click();
    }
  });

  followupInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      followupSubmit.click();
    }
  });

  return {
    sendFromFollowup: (raw) => {
      if (typeof clearVisionAttachment === "function") clearVisionAttachment();
      followupInput.value = "";
      run(raw, followupSubmit);
    },
  };
}

const chatSearchFlow = wireSearchFlow({
  searchInput: chatSearchInput,
  searchSubmit: chatSearchSubmit,
  followupInput: chatFollowupInput,
  followupSubmit: chatFollowupSubmit,
  mode: "learn",
  history: chatHistory,
  threadEl: chatThread,
  statusEl: apiStatus,
  onFirstSend: () => {
    chatSessionOpen = true;
    syncLearnLayout();
  },
  getVisionAttachment: LEARN_VISION_ENABLED ? () => learnChatVisionAttachment : undefined,
  clearVisionAttachment: LEARN_VISION_ENABLED ? clearLearnChatVisionAttachment : undefined,
});

wireStarterChipsAsSend(
  chatFollowupChips,
  CHAT_FOLLOWUP_STARTER_PROMPTS,
  chatSearchFlow.sendFromFollowup,
  chatFollowupSubmit,
  { readAloud: readLastAssistantAloud },
);

wireSearchFlow({
  searchInput: codeSearchInput,
  searchSubmit: codeSearchSubmit,
  followupInput: codeFollowupInput,
  followupSubmit: codeFollowupSubmit,
  mode: "code",
  history: codeHistory,
  threadEl: codeThread,
  statusEl: codeStatus,
  onFirstSend: () => {
    codeSessionOpen = true;
    syncCodeLayout();
  },
});

function wireLearnChatImageAttach() {
  const openPicker = () => learnChatImageInput?.click();
  chatHeroAttachBtn?.addEventListener("click", () => openPicker());
  chatFollowupAttachBtn?.addEventListener("click", () => openPicker());
  learnChatImageInput?.addEventListener("change", async () => {
    const f = learnChatImageInput?.files?.[0];
    if (learnChatImageInput) learnChatImageInput.value = "";
    if (!f) return;
    try {
      learnChatVisionAttachment = await prepareImageForLearnChat(f);
      updateLearnChatAttachPreview();
      showToast("Image attached. Add your question, then Send.");
      chatFollowupInput?.focus();
    } catch (err) {
      showToast(err.message || "Could not read image");
    }
  });
}

/** Hide attach UI and single-row layout when VQA is muted (see LEARN_VISION_ENABLED). */
function applyLearnVisionMuted() {
  if (LEARN_VISION_ENABLED) return;
  document.querySelectorAll(".learn-vision-ui").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".search-bar--learn").forEach((el) => el.classList.remove("search-bar--learn"));
}

applyLearnVisionMuted();
if (LEARN_VISION_ENABLED) {
  wireLearnChatImageAttach();
}

docFileInput.addEventListener("change", () => {
  const f = docFileInput.files?.[0];
  docFileMeta.textContent = f ? `Selected: ${f.name} (${Math.round(f.size / 1024)} KB)` : "";
});

docAnalyzeBtn.addEventListener("click", async () => {
  const file = docFileInput.files?.[0];
  if (!file) {
    notebookStatus.textContent = "Choose a file first";
    return;
  }

  notebookThread.innerHTML = "";
  appendBubble(notebookThread, "user", `Analyze uploaded file: ${file.name}`);

  docAnalyzeBtn.disabled = true;
  notebookStatus.textContent = "Reading and summarizing...";

  try {
    const form = new FormData();
    form.append("document", file);
    const response = await fetch("/api/doc-insights", {
      method: "POST",
      headers: await authHeaders(),
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    const note = data.output || "No response.";
    const meta = data.charsUsed != null ? `\n\n_(Used up to ${data.charsUsed} characters from the document.)_` : "";
    appendBubble(notebookThread, "assistant", `${note}${meta}`, { mode: "notebook", studyMode: "explain" });
    notebookStatus.textContent = "Ready";
  } catch (error) {
    appendBubble(notebookThread, "assistant", `Error: ${error.message}`, { mode: "notebook", studyMode: "explain" });
    notebookStatus.textContent = "Failed";
    showToast(error.message || "Document analysis failed");
  } finally {
    docAnalyzeBtn.disabled = false;
  }
});

async function initBetaBanner() {
  const el = document.getElementById("betaBanner");
  if (!el) return;
  try {
    const r = await fetch("/api/health");
    const h = await r.json();
    const msg = typeof h.betaMessage === "string" ? h.betaMessage.trim() : "";
    if (!msg) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  } catch {
    /* ignore */
  }
}

/**
 * Accept external deep-links like `/?q=...` from browser extensions and prefill Ask.
 * Keeps behavior explicit: user still clicks Ask to send.
 */
function hydratePromptFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const q = String(params.get("q") || "").trim();
    if (!q) return;
    setMainTab("chat");
    chatSearchInput.value = q.slice(0, 4000);
    chatSearchInput.focus();
    params.delete("q");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore malformed URL state */
  }
}

function wireSettingsUi() {
  const syncForm = () => {
    const prefs = loadPrefs();
    if (prefRestoreSessions) prefRestoreSessions.checked = prefs.restoreSessions !== false;
  };
  syncForm();

  openSettingsBtn?.addEventListener("click", () => {
    syncForm();
    settingsModal?.classList.remove("hidden");
  });
  closeSettingsBtn?.addEventListener("click", () => settingsModal?.classList.add("hidden"));
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });
  saveSettingsBtn?.addEventListener("click", () => {
    const prefs = {
      restoreSessions: prefRestoreSessions?.checked !== false,
    };
    savePrefs(prefs);
    saveSessionState();
    settingsModal?.classList.add("hidden");
    showToast("Preferences saved");
  });
}

initMarkdown();
setMainTab("chat");
restoreSessionStateIfEnabled();
syncLearnLayout();
syncCodeLayout();
wireSettingsUi();
wireDefaultPageHintModal();
hydratePromptFromUrl();
initAuth();
initBetaBanner();
