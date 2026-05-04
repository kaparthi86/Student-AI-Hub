const authCard = document.getElementById("authCard");
const appCard = document.getElementById("appCard");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const authStatus = document.getElementById("authStatus");
const userName = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");

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

const chatHistory = [];
const codeHistory = [];

/** Pending file/image payloads for Learn tab; merged into the outbound message on send, not shown in the textarea. */
const chatComposerAttachments = [];
/** Pending attachments for Code tab. */
const codeComposerAttachments = [];

let chatSessionOpen = false;
let codeSessionOpen = false;

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

const DEFAULT_ATTACH_MAX_CHARS = 14000;
/** Max file size before we refuse inline read (bytes). */
const MAX_ATTACH_FILE_BYTES = 4 * 1024 * 1024;
/** Raw binary up to this size may be inlined as truncated base64. */
const MAX_BINARY_RAW_FOR_B64 = 96 * 1024;
/** Max base64 characters embedded in the prompt (rest truncated). */
const MAX_B64_CHARS_IN_PROMPT = 14000;
/** Target max length for embedded JPEG data URLs (characters). */
const MAX_IMAGE_DATA_URL_CHARS = 450000;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortAttachmentLabel(name, maxLen = 40) {
  const n = String(name || "file").trim() || "file";
  if (n.length <= maxLen) return n;
  return `${n.slice(0, Math.max(0, maxLen - 1))}ù`;
}

function newComposerAttachmentId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const COMPOSER_ATTACHMENT_STRIPS = {
  chat: ["chatComposerAttachmentStrip", "chatComposerAttachmentStripFollowup"],
  code: ["codeComposerAttachmentStrip", "codeComposerAttachmentStripFollowup"],
};

/** Same order as the old append-to-textarea behavior: typed text first, then each attachment block. */
function buildOutboundAttachmentMessage(userText, attachments) {
  const payloads = attachments.map((a) => a.payload).filter((p) => typeof p === "string" && p.trim());
  const t = String(userText || "").trim();
  if (!payloads.length) return t;
  if (!t) return payloads.join("\n\n");
  return `${t}\n\n${payloads.join("\n\n")}`;
}

function renderComposerAttachmentStrips(panelKey) {
  const store = panelKey === "code" ? codeComposerAttachments : chatComposerAttachments;
  const stripIds = COMPOSER_ATTACHMENT_STRIPS[panelKey];
  if (!stripIds) return;
  const count = store.length;
  let html = "";
  if (count > 0) {
    html += `<div class="composer-attachments-meta"><span class="muted">${
      count === 1 ? "1 attachment" : `${count} attachments`
    } will be sent with your next message</span></div>`;
    for (const a of store) {
      const label = escapeHtml(a.label);
      const id = escapeHtml(a.id);
      html += `<span class="composer-attach-pill" role="group" aria-label="Attachment ${label}">
  <span class="composer-attach-pill-name" title="${label}">${label}</span>
  <button type="button" class="composer-attach-remove" data-remove-composer-attachment="${id}" aria-label="Remove attachment ${label}">ù</button>
</span>`;
    }
  }
  for (const stripId of stripIds) {
    const el = document.getElementById(stripId);
    if (!el) continue;
    el.innerHTML = html;
    const show = count > 0;
    el.hidden = !show;
  }
}

function isLikelyImageFile(file) {
  const name = file.name || "";
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|svg|ico|tiff?)$/i.test(name);
}

function isMostlyPrintableText(s, sampleLen = 12000) {
  if (!s.length) return true;
  const n = Math.min(s.length, sampleLen);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) bad++;
  }
  return bad / n < 0.02;
}

function readFileBase64Only(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const data = String(r.result || "");
      const i = data.indexOf(",");
      resolve(i >= 0 ? data.slice(i + 1) : data);
    };
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

async function readImageAsJpegDataUrl(file, maxEdge, quality, maxChars) {
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    let { width, height } = bmp;
    const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    let q = quality;
    let dataUrl = canvas.toDataURL("image/jpeg", q);
    let guard = 0;
    while (dataUrl.length > maxChars && q > 0.35 && guard < 14) {
      q -= 0.07;
      dataUrl = canvas.toDataURL("image/jpeg", q);
      guard += 1;
    }
    if (dataUrl.length > maxChars) return null;
    return dataUrl;
  } finally {
    try {
      bmp.close();
    } catch {
      /* ignore */
    }
  }
}

async function buildImageComposerPayload(file) {
  const name = file.name || "image";
  if (file.type === "image/svg+xml" || /\.svg$/i.test(name)) {
    let t = await file.text();
    if (t.length > 24000) t = `${t.slice(0, 24000)}\n<!-- truncated -->`;
    return `--- SVG: ${name} ---\n\`\`\`xml\n${t}\n\`\`\``;
  }
  let dataUrl = await readImageAsJpegDataUrl(file, 1680, 0.82, MAX_IMAGE_DATA_URL_CHARS);
  if (!dataUrl && file.size < 900000) {
    const raw = await readFileAsDataUrl(file);
    if (raw.length <= MAX_IMAGE_DATA_URL_CHARS) dataUrl = raw;
  }
  if (!dataUrl) {
    return `[Image: ${name}] Could not compress small enough to embed here. Add a short description, or resize the image and try again.`;
  }
  return `![${name}](${dataUrl})`;
}

/** Builds the model-facing block for one file; label is for the attachment strip only. */
async function buildComposerAttachmentPayload(file, maxChars) {
  const name = file.name || "file";
  const label = shortAttachmentLabel(name);
  if (!file.size) {
    return { label, payload: `[Attached: ${name}] (empty file)` };
  }
  if (file.size > MAX_ATTACH_FILE_BYTES) {
    return {
      label,
      payload: `[Attached: ${name}] File is ${Math.round(file.size / (1024 * 1024))} MB; max ${Math.round(MAX_ATTACH_FILE_BYTES / (1024 * 1024))} MB for inline attach. Use **Notebook** for large documents.`,
    };
  }

  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    return {
      label,
      payload: `[Attached PDF: ${name}] For a full document summary, use the **Notebook** tab to upload this file, then ask follow-ups here.`,
    };
  }

  if (isLikelyImageFile(file)) {
    try {
      const payload = await buildImageComposerPayload(file);
      return { label, payload };
    } catch {
      return {
        label,
        payload: `[Image: ${name}] Could not read this image. Try another format or describe it in text.`,
      };
    }
  }

  let text;
  try {
    text = await file.text();
  } catch {
    return { label, payload: `[Attached: ${name}] Could not read file. Try again or paste contents manually.` };
  }

  if (isMostlyPrintableText(text)) {
    let body = text;
    if (body.length > maxChars) {
      body = `${body.slice(0, maxChars)}\n\n[...truncated after ${maxChars} characters]`;
    }
    return { label, payload: `--- From file: ${name} (${file.type || "unknown type"}) ---\n${body}` };
  }

  if (file.size <= MAX_BINARY_RAW_FOR_B64) {
    try {
      const b64 = await readFileBase64Only(file);
      const chunk =
        b64.length > MAX_B64_CHARS_IN_PROMPT ? `${b64.slice(0, MAX_B64_CHARS_IN_PROMPT)}\n...[base64 truncated]` : b64;
      return {
        label,
        payload: `--- Binary file: ${name} (${file.type || "application/octet-stream"}, ${file.size} bytes) as base64 ---\n\`\`\`text\n${chunk}\n\`\`\`\n_(If the model cannot use this, use Notebook for PDFs/Zips or describe the file.)_`,
      };
    } catch {
      return {
        label,
        payload: `[Attached: ${name}] Binary file could not be read. Use **Notebook** or paste a relevant excerpt.`,
      };
    }
  }

  return {
    label,
    payload: `[Attached: ${name}] Binary file (${Math.round(file.size / 1024)} KB) is too large for inline base64. Use **Notebook** for documents, or paste the part you need.`,
  };
}

/**
 * Attach chips: queue payloads for the next send and show a strip (search/follow-up textareas stay clean).
 * @param {{ panel: HTMLElement; panelKey: "chat" | "code"; fileInput: HTMLInputElement; photoInput: HTMLInputElement; searchTa: HTMLTextAreaElement; followupTa: HTMLTextAreaElement; statusEl?: HTMLElement; busySubmitBtn?: HTMLButtonElement; maxTextChars?: number }} opts
 */
function wireComposerAttachments(opts) {
  const {
    panel,
    panelKey,
    fileInput,
    photoInput,
    searchTa,
    followupTa,
    statusEl,
    busySubmitBtn,
    maxTextChars = DEFAULT_ATTACH_MAX_CHARS,
  } = opts;
  if (!panel || !panelKey || !fileInput || !photoInput || !searchTa || !followupTa) return;

  const store = panelKey === "code" ? codeComposerAttachments : chatComposerAttachments;

  panel.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove-composer-attachment]");
    if (rm && panel.contains(rm)) {
      const id = rm.getAttribute("data-remove-composer-attachment");
      if (id) {
        const ix = store.findIndex((x) => x.id === id);
        if (ix >= 0) {
          store.splice(ix, 1);
          renderComposerAttachmentStrips(panelKey);
        }
      }
      return;
    }

    const btn = e.target.closest("[data-composer-attach]");
    if (!btn || !panel.contains(btn)) return;
    const targetTa = btn.dataset.composerTarget === "followup" ? followupTa : searchTa;
    if (busySubmitBtn?.disabled && targetTa === followupTa) return;
    const kind = btn.getAttribute("data-composer-attach");
    const targetKey = btn.dataset.composerTarget === "followup" ? "followup" : "search";
    fileInput.dataset.textTarget = targetKey;
    photoInput.dataset.textTarget = targetKey;
    if (kind === "file") fileInput.click();
    else if (kind === "photo") photoInput.click();
  });

  const runAttachment = async (f, focusTa) => {
    if (statusEl) statusEl.textContent = "Reading file...";
    try {
      const { label, payload } = await buildComposerAttachmentPayload(f, maxTextChars);
      store.push({ id: newComposerAttachmentId(), label, payload });
      renderComposerAttachmentStrips(panelKey);
      focusTa?.focus();
    } finally {
      if (statusEl) statusEl.textContent = "Ready";
    }
  };

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;
    const ta = fileInput.dataset.textTarget === "followup" ? followupTa : searchTa;
    if (busySubmitBtn?.disabled && ta === followupTa) return;
    await runAttachment(f, ta);
  });

  photoInput.addEventListener("change", async () => {
    const f = photoInput.files?.[0];
    photoInput.value = "";
    if (!f) return;
    const ta = photoInput.dataset.textTarget === "followup" ? followupTa : searchTa;
    if (busySubmitBtn?.disabled && ta === followupTa) return;
    await runAttachment(f, ta);
  });
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

/** Starter chips send the prompt immediately (same path as Ask / Send). */
function wireStarterChipsAsSend(container, promptMap, sendFn, busyButton) {
  if (!container || !promptMap || typeof sendFn !== "function") return;
  container.addEventListener("click", (e) => {
    const chip = e.target.closest(".starter-chip[data-starter]");
    if (!chip || !container.contains(chip)) return;
    if (busyButton?.disabled) return;
    const key = chip.getAttribute("data-starter");
    const prompt = promptMap[key];
    if (typeof prompt !== "string") return;
    sendFn(prompt);
  });
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
}

/** @returns {{ wrap: HTMLDivElement, bubble: HTMLDivElement }} */
function appendBubble(container, role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (role === "user") {
    const label = document.createElement("div");
    label.className = "bubble-label";
    label.textContent = "You";
    bubble.appendChild(label);
    const pre = document.createElement("pre");
    pre.className = "bubble-text";
    pre.textContent = text;
    bubble.appendChild(pre);
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
 * Assistant row while streaming: render Markdown the same way as the final bubble (no raw # / * then ùjumpù).
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

/** @returns {Promise<boolean>} true if the exchange completed without a client-side failure (attachments cleared on success). */
async function sendChatMessage(mode, message, history, threadEl, statusEl, sendBtn) {
  const trimmed = message.trim();
  if (!trimmed) return false;

  appendBubble(threadEl, "user", trimmed);

  sendBtn.disabled = true;
  statusEl.textContent = "Thinking...";

  const streamUi = startStreamingAssistantBubble(threadEl);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, message: trimmed, history, stream: true }),
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
      appendBubble(threadEl, "assistant", output);
      history.push({ role: "user", content: trimmed });
      history.push({ role: "assistant", content: output });
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

    history.push({ role: "user", content: trimmed });
    history.push({ role: "assistant", content: finalText });
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
      appendBubble(threadEl, "assistant", `Error: ${formatChatErrorForUi(error)}`);
    }
    statusEl.textContent = "Failed";
    return false;
  } finally {
    sendBtn.disabled = false;
  }
}

function showApp(session) {
  const metadata = session?.user?.user_metadata || {};
  const email = session?.user?.email || "";
  const display = metadata.full_name || metadata.name || email.split("@")[0] || "Student";
  userName.textContent = display;
  authCard.classList.add("hidden");
  appCard.classList.remove("hidden");
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
  attachmentStore,
}) {
  const panelKey = mode === "code" ? "code" : "chat";
  const pendingAttachments = attachmentStore || (panelKey === "code" ? codeComposerAttachments : chatComposerAttachments);

  const run = (raw, activeBtn) => {
    const msg = typeof raw === "string" ? raw : "";
    const trimmed = msg.trim();
    const combined = buildOutboundAttachmentMessage(trimmed, pendingAttachments);
    if (!combined.trim()) return;
    if (!history.length) onFirstSend();
    void sendChatMessage(mode, combined, history, threadEl, statusEl, activeBtn).then((ok) => {
      if (ok) {
        pendingAttachments.length = 0;
        renderComposerAttachmentStrips(panelKey);
      }
    });
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
  attachmentStore: chatComposerAttachments,
  onFirstSend: () => {
    chatSessionOpen = true;
    syncLearnLayout();
  },
});

wireStarterChipsAsSend(
  chatFollowupChips,
  CHAT_FOLLOWUP_STARTER_PROMPTS,
  chatSearchFlow.sendFromFollowup,
  chatFollowupSubmit,
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
  attachmentStore: codeComposerAttachments,
  onFirstSend: () => {
    codeSessionOpen = true;
    syncCodeLayout();
  },
});

wireComposerAttachments({
  panel: document.getElementById("panelChat"),
  panelKey: "chat",
  fileInput: document.getElementById("chatAttachFileInput"),
  photoInput: document.getElementById("chatAttachPhotoInput"),
  searchTa: chatSearchInput,
  followupTa: chatFollowupInput,
  statusEl: apiStatus,
  busySubmitBtn: chatFollowupSubmit,
});

wireComposerAttachments({
  panel: document.getElementById("panelCode"),
  panelKey: "code",
  fileInput: document.getElementById("codeAttachFileInput"),
  photoInput: document.getElementById("codeAttachPhotoInput"),
  searchTa: codeSearchInput,
  followupTa: codeFollowupInput,
  statusEl: codeStatus,
  busySubmitBtn: codeFollowupSubmit,
});

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
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    const note = data.output || "No response.";
    const meta = data.charsUsed != null ? `\n\n_(Used up to ${data.charsUsed} characters from the document.)_` : "";
    appendBubble(notebookThread, "assistant", `${note}${meta}`);
    notebookStatus.textContent = "Ready";
  } catch (error) {
    appendBubble(notebookThread, "assistant", `Error: ${error.message}`);
    notebookStatus.textContent = "Failed";
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

initMarkdown();
setMainTab("chat");
syncLearnLayout();
syncCodeLayout();
initAuth();
initBetaBanner();
