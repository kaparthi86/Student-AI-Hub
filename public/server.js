const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { Readable } = require("node:stream");
const multer = require("multer");

const envPath = path.join(__dirname, ".env");
const envResult = dotenv.config({ path: envPath });
if (envResult.error && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.warn("Note: could not load .env file next to server.js:", envResult.error.message);
}

const app = express();
const PORT = process.env.PORT || 3000;
const HF_API_TOKEN = String(process.env.HF_API_TOKEN || "").trim();

/** Trim quotes and fix common copy-paste typos (fullwidth colon, etc.). */
function normalizeEnvString(s) {
  let t = String(s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\uFF1A/g, ":").replace(/\u2013|\u2014/g, "-");
}

/** Same cleanup as HF_* (Render / .env often paste quoted URLs or keys). */
const SUPABASE_URL = normalizeEnvString(process.env.SUPABASE_URL || "");
const SUPABASE_ANON_KEY = normalizeEnvString(process.env.SUPABASE_ANON_KEY || "");
const SUPABASE_SERVICE_ROLE_KEY = normalizeEnvString(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

if (SUPABASE_ANON_KEY.startsWith("sb_secret_")) {
  // eslint-disable-next-line no-console
  console.warn(
    "SUPABASE_ANON_KEY looks like a secret key (sb_secret_*). Use the publishable/anon key for SUPABASE_ANON_KEY; put service_role only in SUPABASE_SERVICE_ROLE_KEY.",
  );
}

/**
 * Model id on the Hugging Face Hub (Inference Providers).
 * Router usually needs a provider suffix, e.g. "org/model:fastest" or "org/model:groq"
 * See: https://huggingface.co/docs/inference-providers/index
 */
function ensureInferenceRoutingSuffix(modelId) {
  const m = String(modelId || "").trim();
  if (!m || !m.includes("/")) return m;
  const firstSlash = m.indexOf("/");
  if (m.indexOf(":", firstSlash + 1) !== -1) return m;
  return `${m}:fastest`;
}

const HF_MODEL_RAW =
  normalizeEnvString(process.env.HF_MODEL) || "deepseek-ai/DeepSeek-V4-Pro:fastest";
const HF_MODEL = ensureInferenceRoutingSuffix(HF_MODEL_RAW);
if (HF_MODEL !== HF_MODEL_RAW) {
  // eslint-disable-next-line no-console
  console.log(`HF_MODEL had no routing suffix; using "${HF_MODEL}" (Inference Providers need e.g. :fastest or :groq).`);
}
/** Optional: vision-capable Hub id (with routing suffix) used when chat includes images. Falls back to HF_MODEL if unset. */
const HF_MODEL_VISION_RAW = normalizeEnvString(process.env.HF_MODEL_VISION);
const HF_MODEL_VISION = HF_MODEL_VISION_RAW ? ensureInferenceRoutingSuffix(HF_MODEL_VISION_RAW) : "";

/**
 * Ask-tab image attach / multimodal (VQA). Off by default; set ENABLE_LEARN_VISION=1 on the server.
 * The browser UI is gated separately in public/app.js (`LEARN_VISION_ENABLED`); turn both on to ship the feature.
 */
const ENABLE_LEARN_VISION = ["1", "true", "yes"].includes(
  String(process.env.ENABLE_LEARN_VISION || "").trim().toLowerCase()
);
/** OpenAI-compatible chat completions endpoint (Inference Providers / Router). */
const HF_CHAT_URL =
  normalizeEnvString(process.env.HF_CHAT_URL) || "https://router.huggingface.co/v1/chat/completions";
const envFileExists = fs.existsSync(envPath);

const MAX_DOC_CHARS = 45000;
const MAX_CHAT_HISTORY = 24;

/** Exact-replay cache (per-user key): skips provider calls for identical payloads within TTL. */
const RESPONSE_CACHE_TTL_MS = Math.max(0, Number(process.env.HF_RESPONSE_CACHE_TTL_SEC || 0) * 1000);
const RESPONSE_CACHE_MAX = Math.max(16, Math.min(5000, Number(process.env.HF_RESPONSE_CACHE_MAX_ENTRIES || 400)));
const completionResponseCache = new Map();

/** Forward OpenAI-style prompt cache routing (ignored by many HF providers; safe only when your router accepts it). */
const FORWARD_PROMPT_CACHE_PARAMS = ["1", "true", "yes"].includes(
  String(process.env.HF_FORWARD_PROMPT_CACHE_PARAMS || "").trim().toLowerCase()
);
const PROMPT_CACHE_RETENTION = String(process.env.HF_PROMPT_CACHE_RETENTION || "").trim();
const LOG_PROMPT_CACHE_USAGE = ["1", "true", "yes"].includes(
  String(process.env.HF_LOG_PROMPT_CACHE_USAGE || "").trim().toLowerCase()
);

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function stableJson(obj) {
  return JSON.stringify(obj);
}

function completionCacheGet(hashKey) {
  if (!RESPONSE_CACHE_TTL_MS) return null;
  const row = completionResponseCache.get(hashKey);
  if (!row) return null;
  if (Date.now() > row.exp) {
    completionResponseCache.delete(hashKey);
    return null;
  }
  return row.text;
}

function completionCacheSet(hashKey, text) {
  if (!RESPONSE_CACHE_TTL_MS || typeof text !== "string" || !text.trim()) return;
  while (completionResponseCache.size >= RESPONSE_CACHE_MAX) {
    const k = completionResponseCache.keys().next().value;
    completionResponseCache.delete(k);
  }
  completionResponseCache.set(hashKey, { exp: Date.now() + RESPONSE_CACHE_TTL_MS, text });
}

function buildCompletionCacheHash(cacheUserKey, messages, kind = "json", modelKey = HF_MODEL) {
  return sha256Hex(["v1", String(modelKey || HF_MODEL), kind, String(cacheUserKey || ""), stableJson(messages)].join("\x1e"));
}

function augmentOpenAiPromptCacheFields(body, promptCacheKey) {
  if (!FORWARD_PROMPT_CACHE_PARAMS) return body;
  if (PROMPT_CACHE_RETENTION === "in_memory" || PROMPT_CACHE_RETENTION === "24h") {
    body.prompt_cache_retention = PROMPT_CACHE_RETENTION;
  }
  if (promptCacheKey) {
    body.prompt_cache_key = String(promptCacheKey).slice(0, 128);
  }
  return body;
}

function buildChatCompletionPayload(messages, { stream, temperature, max_tokens, promptCacheKey, model }) {
  const body = {
    model: model || HF_MODEL,
    messages,
    temperature,
    max_tokens,
    stream: Boolean(stream),
  };
  augmentOpenAiPromptCacheFields(body, promptCacheKey);
  return body;
}

function logUsageIfPresent(data, label) {
  if (!LOG_PROMPT_CACHE_USAGE || !data?.usage) return;
  const u = data.usage;
  const cached = u.prompt_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached;
  // eslint-disable-next-line no-console
  console.log(`[${label}] usage:`, JSON.stringify({ ...u, cached_tokens_hint: cached }));
}

function sendSseSingleChunk(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

/**
 * Replay archived provider SSE. A single res.end(blob) often arrives as one fetch read(), so the
 * client parses every data: line in one turn and streaming UI does not update incrementally.
 */
async function replayCachedSseResponse(res, archivedUtf8) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  const s = String(archivedUtf8);
  const step = 4096;
  for (let i = 0; i < s.length; i += step) {
    res.write(s.slice(i, Math.min(s.length, i + step)));
    if (i + step < s.length) await new Promise((r) => setImmediate(r));
  }
  res.end();
}

/** Tee provider SSE: stream to client and store raw bytes for identical replay (same cache key as stream hits). */
function pipeProviderSseWithArchive(res, hfResBody, streamCacheHash) {
  if (!RESPONSE_CACHE_TTL_MS || !hfResBody || typeof hfResBody.tee !== "function") return false;
  try {
    const [toClient, toArchive] = hfResBody.tee();
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const nodeClient = Readable.fromWeb(toClient);
    res.on("close", () => nodeClient.destroy());
    nodeClient.on("error", () => {
      if (!res.writableEnded) res.end();
    });
    nodeClient.pipe(res);

    (async () => {
      try {
        const reader = toArchive.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength) chunks.push(Buffer.from(value));
        }
        if (chunks.length) completionCacheSet(streamCacheHash, Buffer.concat(chunks).toString("utf8"));
      } catch {
        /* ignore */
      }
    })();

    return true;
  } catch {
    return false;
  }
}

/** Invite-only / class testing: drives optional banner text in /api/health for ~20 testers. */
const BETA_TESTING = ["1", "true", "yes"].includes(String(process.env.BETA_TESTING || "").trim().toLowerCase());

function betaBannerText() {
  const custom = String(process.env.BETA_MESSAGE || "").trim();
  if (custom) return custom;
  if (BETA_TESTING) {
    return "Private beta - invite-only (about 20 testers). Data or features may reset; not the final product.";
  }
  return "";
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const publicDir = path.join(__dirname, "public");
const indexHtmlPath = path.join(publicDir, "index.html");
const feedbackLogPath = path.join(__dirname, "feedback.ndjson");
const feedbackTmpLogPath = path.join("/tmp", "feedback.ndjson");

let supabaseAuthClient = null;
function getSupabaseAuthClient() {
  if (supabaseAuthClient) return supabaseAuthClient;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  supabaseAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAuthClient;
}

/** Server-only: bypasses RLS for feedback inserts. Never expose this key to the browser. */
let supabaseAdminClient = null;
function getSupabaseAdminClient() {
  if (supabaseAdminClient) return supabaseAdminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  supabaseAdminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAdminClient;
}

function parseClientCreatedAt(iso) {
  const s = String(iso || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function persistFeedbackRow({
  userId,
  rating,
  reason,
  mode,
  studyMode,
  assistantMessage,
  clientCreatedAt,
}) {
  const admin = getSupabaseAdminClient();
  if (!admin || !userId) return { stored: null, error: new Error("no admin client or user") };

  const row = {
    user_id: userId,
    rating,
    reason,
    mode,
    study_mode: studyMode,
    assistant_message: assistantMessage.length ? assistantMessage : null,
    client_created_at: parseClientCreatedAt(clientCreatedAt),
  };

  const { error } = await admin.from("assistant_feedback").insert(row);
  if (error) return { stored: null, error };
  return { stored: "supabase", error: null };
}

function mustVerifySession() {
  if (process.env.NODE_ENV === "production") return true;
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function logAuthFailures() {
  return ["1", "true", "yes"].includes(String(process.env.LOG_AUTH_ERRORS || "").trim().toLowerCase());
}

/**
 * Validate the browser's Supabase access_token via GoTrue HTTP API (same contract as Auth docs).
 * Runs before supabase-js getUser/getClaims to avoid client/SDK mismatches with publishable keys or JWT shape changes.
 */
async function fetchGoTrueUser(accessToken) {
  const base = String(SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const apikey = String(SUPABASE_ANON_KEY || "").trim();
  if (!base || !apikey || !accessToken) return null;

  const url = `${base}/auth/v1/user`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey,
      },
      signal: ac.signal,
    });
    const txt = await res.text();
    let body;
    try {
      body = JSON.parse(txt);
    } catch {
      body = null;
    }
    if (!res.ok) {
      if (logAuthFailures()) {
        // eslint-disable-next-line no-console
        console.warn("[auth] GET /auth/v1/user", res.status, typeof body === "object" ? JSON.stringify(body).slice(0, 400) : txt.slice(0, 400));
      }
      return null;
    }
    if (body && typeof body === "object" && typeof body.id === "string") return body;
    return null;
  } catch (e) {
    if (logAuthFailures()) {
      // eslint-disable-next-line no-console
      console.warn("[auth] GET /auth/v1/user network error:", e?.message || e);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function requireSession(req, res, next) {
  if (!mustVerifySession()) return next();
  const client = getSupabaseAuthClient();
  if (!client) {
    return res.status(500).json({ error: "Auth is not configured on the server." });
  }
  const raw = String(req.headers.authorization || "");
  const m = /^Bearer\s+(\S+)/i.exec(raw);
  if (!m) return res.status(401).json({ error: "Sign in required." });
  const jwt = m[1];
  const logAuth = logAuthFailures();

  void (async () => {
    const userFromHttp = await fetchGoTrueUser(jwt);
    if (userFromHttp) {
      req.user = userFromHttp;
      return next();
    }
    if (logAuth) {
      // eslint-disable-next-line no-console
      console.warn("[auth] HTTP user fetch failed; trying supabase-js getClaims / getUser");
    }

    try {
      if (typeof client.auth.getClaims === "function") {
        const { data: claimData, error: claimErr } = await client.auth.getClaims(jwt);
        if (!claimErr && claimData?.claims?.sub) {
          const c = claimData.claims;
          req.user = {
            id: c.sub,
            email: c.email,
            app_metadata: typeof c.app_metadata === "object" && c.app_metadata ? c.app_metadata : {},
            user_metadata: typeof c.user_metadata === "object" && c.user_metadata ? c.user_metadata : {},
          };
          return next();
        }
        if (logAuth && claimErr) {
          // eslint-disable-next-line no-console
          console.warn("[auth] getClaims:", claimErr.message || claimErr);
        }
      }
    } catch (e) {
      if (logAuth) {
        // eslint-disable-next-line no-console
        console.warn("[auth] getClaims threw:", e?.message || e);
      }
    }

    try {
      const { data: { user }, error } = await client.auth.getUser(jwt);
      if (error || !user) {
        if (logAuth) {
          // eslint-disable-next-line no-console
          console.warn("[auth] getUser:", error?.message || error || "no user");
        }
        return res.status(401).json({ error: "Session expired. Sign in again." });
      }
      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  })();
}

if (!fs.existsSync(indexHtmlPath)) {
  // eslint-disable-next-line no-console
  console.error(
    [
      "ERROR: public/index.html is missing from this deploy.",
      `Expected file at: ${indexHtmlPath}`,
      "Fix: (1) In your machine repo, run: git add public && git commit -m \"Add public assets\" && git push",
      "    (2) On Render: Settings -> Root Directory must be empty unless this app lives in a subfolder that CONTAINS public/",
      "    (3) Manual Deploy after push. Check /api/health -> indexHtmlDeployed should be true.",
    ].join("\n")
  );
}

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(cors());
app.use(express.json({ limit: "15mb" }));

/** Per-IP fixed window limiter (no `express-rate-limit` package ? avoids deploy missing-module issues). */
function createApiMemoryRateLimiter() {
  const windowMs = 60_000;
  const max = Math.max(1, Math.min(5000, Number(process.env.API_RATE_LIMIT_PER_MINUTE || 80)));
  const hits = new Map();
  const maxKeys = 8000;

  function prune(now) {
    if (hits.size <= maxKeys) return;
    for (const [k, v] of hits) {
      if (now >= v.reset) hits.delete(k);
      if (hits.size <= maxKeys * 0.75) break;
    }
  }

  return function apiRateLimit(req, res, next) {
    const now = Date.now();
    prune(now);
    const key = req.ip || "unknown";
    let row = hits.get(key);
    if (!row || now >= row.reset) {
      row = { n: 0, reset: now + windowMs };
      hits.set(key, row);
    }
    row.n += 1;
    const remaining = Math.max(0, max - row.n);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(row.reset / 1000)));
    if (row.n > max) {
      const retrySec = Math.max(1, Math.ceil((row.reset - now) / 1000));
      res.setHeader("Retry-After", String(retrySec));
      res.status(429).json({ error: "Too many requests. Please try again in a moment." });
      return;
    }
    next();
  };
}

const apiLimiter = createApiMemoryRateLimiter();

app.use("/api", (req, res, next) => {
  if (req.method === "GET" && req.path === "/health") return next();
  return apiLimiter(req, res, next);
});
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".webmanifest")) {
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      }
    },
  })
);

/** Render + express.static: always wire `/` to the SPA shell (static may 404 before fallthrough in some cases). */
app.get("/", (_req, res) => {
  res.sendFile("index.html", { root: publicDir });
});
app.get("/index.html", (_req, res) => {
  res.sendFile("index.html", { root: publicDir });
});

function buildPrompt(mode, userInput) {
  if (mode === "code") {
    return `You are a coding tutor for students. Explain clearly and briefly.\n\nStudent request:\n${userInput}`;
  }
  return `You are a friendly study coach for students. Give practical, concise advice.\n\nStudent request:\n${userInput}`;
}

function explainRouterModelError(status, rawBody) {
  try {
    const parsed = JSON.parse(rawBody);
    const errField = parsed?.error;
    const msg =
      typeof errField === "string"
        ? errField
        : errField?.message || (typeof parsed?.message === "string" ? parsed.message : "");
    const code =
      typeof errField === "object" && errField && "code" in errField ? errField.code : parsed?.code;

    if (status === 401) {
      const lower = String(msg || rawBody || "").toLowerCase();
      if (lower.includes("invalid") || lower.includes("unauthorized") || lower.includes("authentication")) {
        return [
          "Hugging Face returned HTTP 401 (authentication failed). The text \"Invalid username or password\" refers to your **HF_API_TOKEN**, not your Google / Student app login.",
          "",
          "Fix:",
          "1) Open https://huggingface.co/settings/tokens and create a **new** token (classic with Read, or fine-grained with **Make calls to Inference Providers**).",
          "2) In Render **Environment** (or local `.env`), set **HF_API_TOKEN** to that token only ? no quotes, no spaces, full string starting with `hf_`.",
          "3) **Redeploy** or restart the service after saving env vars.",
          "4) Confirm **HF_CHAT_URL** is `https://router.huggingface.co/v1/chat/completions` unless you use another HF endpoint.",
          "",
          `Provider message: ${msg || rawBody.slice(0, 300)}`,
        ].join("\n");
      }
    }

    if (
      status === 400 &&
      (code === "model_not_supported" ||
        (typeof msg === "string" && msg.toLowerCase().includes("not supported")))
    ) {
      return [
        "Hugging Face Inference Providers: this model is not available with your enabled providers (or your token permissions).",
        "Fix options:",
        "1) Hugging Face -> Settings -> Inference Providers: enable at least one provider, or adjust provider preferences.",
        "2) Use a fine-grained token with permission: \"Make calls to Inference Providers\" (see HF token creation page).",
        "3) Change HF_MODEL in .env to a model your providers support. Try adding a suffix like :fastest or :groq.",
        `Details: ${typeof msg === "string" ? msg : JSON.stringify(parsed)}`,
      ].join("\n");
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** HF sometimes returns "The string did not match the expected pattern" for bad model id / payload. */
function explainProviderPatternError(rawBody) {
  const raw = String(rawBody || "");
  if (!/expected pattern/i.test(raw)) return null;
  let detail = raw.slice(0, 600);
  try {
    const parsed = JSON.parse(raw);
    detail =
      (typeof parsed?.error?.message === "string" && parsed.error.message) ||
      (typeof parsed?.message === "string" && parsed.message) ||
      (typeof parsed?.detail === "string" && parsed.detail) ||
      JSON.stringify(parsed);
  } catch {
    /* use slice above */
  }
  return [
    "The Hugging Face API rejected the request (validation / pattern error). Check your `.env` next to `server.js`:",
    "",
    "1) **HF_MODEL** - Use a valid Hub id with a routing suffix, e.g. `deepseek-ai/DeepSeek-V4-Pro:fastest`. Re-type it (no smart quotes).",
    "2) **HF_CHAT_URL** - Should be `https://router.huggingface.co/v1/chat/completions` unless you use a custom endpoint.",
    "3) **HF_API_TOKEN** - Fine-grained token with permission to call Inference Providers.",
    "",
    `Provider detail: ${detail}`,
  ].join("\n");
}

function sanitizeDocText(raw) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

async function extractTextFromUpload(file) {
  if (!file?.buffer) return "";
  const original = file.originalname || "upload";
  const lower = original.toLowerCase();
  const mime = file.mimetype || "";

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const pdfParse = require("pdf-parse");
    const parsed = await pdfParse(file.buffer);
    return sanitizeDocText(parsed.text || "");
  }

  if (
    mime.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json")
  ) {
    return sanitizeDocText(file.buffer.toString("utf8"));
  }

  throw new Error(
    "Unsupported file type. Use .txt, .md, .csv, .json, or .pdf."
  );
}

function truncateForPrompt(text, maxChars) {
  const t = String(text || "");
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[Document truncated for length.]`;
}

/** Static system first (prefix-cache friendly); variable document only in the user message. */
const NOTEBOOK_SYSTEM_STATIC = `You create accurate student study materials. Never invent facts not present in the document. Prefer Markdown.

You are "Study Notebook", a notebook-style study assistant.

Using ONLY the document content in the user message (between DOCUMENT START and DOCUMENT END), produce structured study notes for students:
1) Executive summary (5-8 bullets)
2) Key concepts and definitions (bullet list)
3) Important formulas / steps / algorithms (if any; else say "None obvious")
4) 8 quiz questions with answers (mix easy/medium)
5) A 7-day study plan (short daily tasks)

Rules:
- If information is missing, say "Not in document" instead of guessing.
- Use clear Markdown headings (##) for each section.
- The user message includes the file name and extracted document text.`;

function notebookUserContent(docName, docText) {
  const body = truncateForPrompt(docText, MAX_DOC_CHARS);
  return `Document name: "${docName}"

--- DOCUMENT START ---
${body}
--- DOCUMENT END ---`;
}

async function callChatCompletion(messages, options = {}) {
  if (!HF_API_TOKEN) {
    return "Demo mode: add HF_API_TOKEN in .env next to server.js, then restart the server.";
  }

  let chatEndpoint;
  try {
    chatEndpoint = new URL(HF_CHAT_URL);
  } catch {
    throw new Error(
      `HF_CHAT_URL is not a valid URL. Fix .env (example: https://router.huggingface.co/v1/chat/completions). Value starts with: ${String(HF_CHAT_URL).slice(0, 48)}`
    );
  }
  if (chatEndpoint.protocol !== "http:" && chatEndpoint.protocol !== "https:") {
    throw new Error("HF_CHAT_URL must use http: or https:");
  }

  const temperature = typeof options.temperature === "number" ? options.temperature : 0.55;
  const max_tokens = typeof options.max_tokens === "number" ? options.max_tokens : 700;
  const cacheUserKey = options.cacheUserKey != null ? String(options.cacheUserKey) : "";
  const promptCacheKey = options.promptCacheKey != null ? String(options.promptCacheKey) : "";
  const modelKey = options.model != null ? String(options.model) : HF_MODEL;

  const cacheHash = buildCompletionCacheHash(cacheUserKey, messages, "json", modelKey);
  const cachedText = completionCacheGet(cacheHash);
  if (cachedText) return cachedText;

  const payload = buildChatCompletionPayload(messages, {
    stream: false,
    temperature,
    max_tokens,
    promptCacheKey,
    model: modelKey,
  });

  const response = await fetch(chatEndpoint.href, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    const explained =
      explainRouterModelError(response.status, errText) || explainProviderPatternError(errText);
    if (explained) return explained;
    const snippet = errText.startsWith("<!DOCTYPE") ? "(HTML error page from provider)" : errText.slice(0, 800);
    throw new Error(`Model API failed: ${response.status} ${snippet}`);
  }

  const data = await response.json();
  logUsageIfPresent(data, "chat");
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    const out = content.trim();
    completionCacheSet(cacheHash, out);
    return out;
  }
  if (data?.error)
    return `Hugging Face error: ${typeof data.error === "string" ? data.error : JSON.stringify(data.error)}`;
  return `Unexpected model response: ${JSON.stringify(data).slice(0, 800)}`;
}

async function queryModelSingle(mode, userInput, callOpts = {}) {
  const prompt = buildPrompt(mode, userInput);
  const { promptCacheKey: pcq, ...rest } = callOpts;
  return callChatCompletion(
    [
      {
        role: "system",
        content:
          "You help students learn. Be concise, accurate, and encouraging. If asked for code, include short examples.",
      },
      { role: "user", content: prompt },
    ],
    {
      max_tokens: 500,
      temperature: 0.6,
      ...rest,
      promptCacheKey: pcq || `single:${mode}`,
    }
  );
}

function normalizeChatMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").trim().slice(0, 8000),
    }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_CHAT_HISTORY);
}

const MAX_CHAT_IMAGE_BYTES = 3 * 1024 * 1024;

function normalizeImageMime(mime) {
  const m = String(mime || "").trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(m)) return m;
  return null;
}

/**
 * @returns {string | Array<{type:string, [k:string]: unknown}> | null}
 */
function buildMultimodalUserContent(text, imageBase64, imageMime) {
  const t = String(text || "").trim().slice(0, 4000);
  const mime = normalizeImageMime(imageMime);
  const b64 = imageBase64 != null ? String(imageBase64).replace(/\s/g, "") : "";
  if (!mime || !b64) {
    if (!t) return null;
    return t;
  }
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new Error("Invalid image data (base64).");
  }
  if (buf.length > MAX_CHAT_IMAGE_BYTES) {
    throw new Error("Image too large (max about 3 MB decoded).");
  }
  if (buf.length < 32) throw new Error("Image data too small or corrupt.");
  const url = `data:${mime};base64,${buf.toString("base64")}`;
  return [
    { type: "image_url", image_url: { url } },
    { type: "text", text: t || "Answer using the image." },
  ];
}

function historyUserEntryToApiMessage(entry) {
  const text = String(entry?.content || "").trim().slice(0, 8000);
  const mime = normalizeImageMime(entry?.imageMime);
  const b64 = entry?.imageBase64 != null ? String(entry.imageBase64).replace(/\s/g, "") : "";
  if (mime && b64) {
    return { role: "user", content: buildMultimodalUserContent(text, b64, mime) };
  }
  if (!text) return null;
  return { role: "user", content: text };
}

function normalizeMultimodalChatHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const role = entry.role === "assistant" ? "assistant" : "user";
    if (role === "assistant") {
      const content = String(entry.content || "").trim().slice(0, 8000);
      if (content) out.push({ role: "assistant", content });
      continue;
    }
    try {
      const msg = historyUserEntryToApiMessage(entry);
      if (msg) {
        const c = msg.content;
        if (typeof c === "string" && c.length) out.push(msg);
        else if (Array.isArray(c) && c.length) out.push(msg);
      }
    } catch {
      /* skip invalid image history row */
    }
  }
  return out.slice(-MAX_CHAT_HISTORY);
}

function messagesIncludeImages(msgs) {
  return msgs.some(
    (m) =>
      m &&
      m.role === "user" &&
      Array.isArray(m.content) &&
      m.content.some((p) => p && typeof p === "object" && p.type === "image_url"),
  );
}

function pickChatModelForMessages(msgs) {
  if (!messagesIncludeImages(msgs)) return HF_MODEL;
  return HF_MODEL_VISION || HF_MODEL;
}

function chatSystemBase(mode) {
  return mode === "code"
    ? "You are a patient coding tutor for students. Keep answers concise. Use Markdown code fences for code. Answer the question directly; do not open by restating or paraphrasing what they asked unless they are unclear."
    : "You are a friendly study coach for students. Answer directly?start with useful content, not a reframed repeat of their question (avoid lines like 'So you want?' or 'We need to?'). Keep answers concise and actionable. Use Markdown when helpful.";
}

function modeStyleInstruction(studyMode) {
  const m = String(studyMode || "explain").trim().toLowerCase();
  if (m === "quiz") {
    return "Mode: Quiz. Give 4-6 short questions first, then provide answer key with concise explanations.";
  }
  return "Mode: Explain. Give a clear explanation with a compact example. No meta preamble that only restates the topic.";
}

const WEAK_TOPIC_SYSTEM_STATIC = `You are a student coach. Build a "weak-topic recap" from the activity data in the user message.

Return Markdown with:
## Likely weak topics (max 5)
- topic + why
## 7-day improvement plan
- one short task/day
## Quick checks
- 5 mini questions to verify progress

If data is sparse, say so briefly and still give a conservative plan.`;

function weakTopicRecapUserContent(mode, recentSearches, history) {
  const modeLabel = mode === "code" ? "coding" : "learning";
  const recent = (Array.isArray(recentSearches) ? recentSearches : [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 10);
  const hist = (Array.isArray(history) ? history : [])
    .map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || "").trim().slice(0, 1200),
    }))
    .filter((m) => m.content)
    .slice(-12);
  return `Activity type: ${modeLabel}

Recent searches:
${recent.length ? recent.map((x, i) => `${i + 1}. ${x}`).join("\n") : "(none)"}

Recent chat transcript:
${hist.length ? hist.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n") : "(none)"}`;
}

app.post("/api/ai", requireSession, async (req, res) => {
  try {
    const mode = req.body?.mode === "code" ? "code" : "learn";
    const input = String(req.body?.input || "").trim().slice(0, 2000);
    if (!input) return res.status(400).json({ error: "Input is required." });

    const uid = req.user?.id || "";
    const output = await queryModelSingle(mode, input, {
      cacheUserKey: uid,
      promptCacheKey: `${uid}:${mode}:ai`,
    });
    return res.json({ output });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/chat", requireSession, async (req, res) => {
  try {
    const mode = req.body?.mode === "code" ? "code" : "learn";
    const studyMode = ["explain", "quiz"].includes(String(req.body?.studyMode || "").toLowerCase())
      ? String(req.body.studyMode).toLowerCase()
      : "explain";
    const learnVisionOn = mode === "learn" && ENABLE_LEARN_VISION;
    const imageMimeIn = req.body?.imageMime;
    const imageB64In = req.body?.imageBase64 != null ? String(req.body.imageBase64).replace(/\s/g, "") : "";
    const hasCurrentImage =
      learnVisionOn && Boolean(normalizeImageMime(imageMimeIn) && imageB64In.length > 40);

    let lastMessage = String(req.body?.message || "").trim().slice(0, 4000);
    if (!lastMessage && hasCurrentImage) {
      lastMessage = "Explain what you see and help with any problem or diagram in the image.";
    }
    if (!lastMessage) {
      return res.status(400).json({
        error: learnVisionOn ? "message is required (or attach an image)." : "message is required.",
      });
    }

    const historyApi = learnVisionOn
      ? normalizeMultimodalChatHistory(req.body?.history)
      : normalizeChatMessages(req.body?.history);

    let lastUserContent;
    try {
      lastUserContent =
        learnVisionOn && hasCurrentImage
          ? buildMultimodalUserContent(lastMessage, imageB64In, imageMimeIn)
          : lastMessage;
    } catch (e) {
      return res.status(400).json({ error: e.message || "Invalid image." });
    }
    if (lastUserContent == null) {
      return res.status(400).json({ error: "message is required." });
    }

    const system = `${chatSystemBase(mode)}\n${modeStyleInstruction(studyMode)}`;
    const coreMessages = [...historyApi, { role: "user", content: lastUserContent }];
    const modelForRequest = pickChatModelForMessages(coreMessages);
    const messages = [{ role: "system", content: system }, ...coreMessages];
    const cacheUserKey = req.user?.id || "";
    const promptCacheKey = `${cacheUserKey}:${mode}:${studyMode}`;
    const streamCacheHash = buildCompletionCacheHash(cacheUserKey, messages, "sse", modelForRequest);
    const visionTurn = messagesIncludeImages(coreMessages);
    const maxOutTokens = visionTurn ? 1100 : 720;

    const wantsStream = req.body?.stream === true;
    if (wantsStream) {
      let chatEndpoint;
      try {
        chatEndpoint = new URL(HF_CHAT_URL);
      } catch {
        return res.status(500).json({
          error: `HF_CHAT_URL is not a valid URL. Value starts with: ${String(HF_CHAT_URL).slice(0, 48)}`,
        });
      }
      if (chatEndpoint.protocol !== "http:" && chatEndpoint.protocol !== "https:") {
        return res.status(500).json({ error: "HF_CHAT_URL must use http: or https:" });
      }

      const demoLine = () => {
        const demo =
          "Demo mode: add HF_API_TOKEN in .env next to server.js, then restart the server.";
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        if (typeof res.flushHeaders === "function") res.flushHeaders();
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: demo } }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      };

      if (!HF_API_TOKEN) {
        demoLine();
        return;
      }

      if (RESPONSE_CACHE_TTL_MS) {
        const hit = completionCacheGet(streamCacheHash);
        if (hit) {
          await replayCachedSseResponse(res, hit);
          return;
        }
      }

      const hfRes = await fetch(chatEndpoint.href, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildChatCompletionPayload(messages, {
            stream: true,
            temperature: 0.55,
            max_tokens: maxOutTokens,
            promptCacheKey,
            model: modelForRequest,
          })
        ),
      });

      if (!hfRes.ok) {
        const errText = await hfRes.text();
        const explained =
          explainRouterModelError(hfRes.status, errText) || explainProviderPatternError(errText);
        return res.status(502).json({
          error: explained || `Model API failed: ${hfRes.status} ${errText.slice(0, 800)}`,
        });
      }

      if (!hfRes.body) {
        return res.status(502).json({ error: "Model API returned an empty response body." });
      }

      if (pipeProviderSseWithArchive(res, hfRes.body, streamCacheHash)) {
        return;
      }

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") res.flushHeaders();

      const nodeReadable = Readable.fromWeb(hfRes.body);
      res.on("close", () => {
        nodeReadable.destroy();
      });
      nodeReadable.on("error", () => {
        if (!res.writableEnded) res.end();
      });
      nodeReadable.pipe(res);
      return;
    }

    const output = await callChatCompletion(messages, {
      max_tokens: maxOutTokens,
      temperature: 0.55,
      cacheUserKey,
      promptCacheKey,
      model: modelForRequest,
    });
    return res.json({ output });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/doc-insights", requireSession, upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded (field name: document)." });

    let text;
    try {
      text = await extractTextFromUpload(req.file);
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not read file." });
    }

    if (!text) return res.status(400).json({ error: "Could not extract text from this file." });

    const name = req.file.originalname || "document";
    const docHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const uid = req.user?.id || "";
    const cacheUserKey = `${uid}:${docHash}`;

    const output = await callChatCompletion(
      [
        { role: "system", content: NOTEBOOK_SYSTEM_STATIC },
        { role: "user", content: notebookUserContent(name, text) },
      ],
      {
        max_tokens: 1400,
        temperature: 0.35,
        cacheUserKey,
        promptCacheKey: `notebook:${docHash.slice(0, 40)}`,
      }
    );

    return res.json({ output, docName: name, charsUsed: Math.min(text.length, MAX_DOC_CHARS) });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/weak-topic-recap", requireSession, async (req, res) => {
  try {
    const mode = req.body?.mode === "code" ? "code" : "learn";
    const userBlock = weakTopicRecapUserContent(mode, req.body?.recentSearches, req.body?.history);
    const uid = req.user?.id || "";
    const output = await callChatCompletion(
      [{ role: "system", content: WEAK_TOPIC_SYSTEM_STATIC }, { role: "user", content: userBlock }],
      {
        max_tokens: 1100,
        temperature: 0.4,
        cacheUserKey: uid,
        promptCacheKey: `weak:${mode}:${sha256Hex(userBlock).slice(0, 32)}`,
      }
    );
    return res.json({ output });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/feedback", requireSession, async (req, res) => {
  try {
    const ratingRaw = Number(req.body?.rating);
    if (ratingRaw !== 1 && ratingRaw !== -1) {
      return res.status(400).json({ error: "rating must be 1 or -1" });
    }
    const mode = req.body?.mode === "code" ? "code" : req.body?.mode === "notebook" ? "notebook" : "learn";
    const studyMode = ["explain", "quiz"].includes(String(req.body?.studyMode || ""))
      ? String(req.body.studyMode)
      : "explain";
    const reason = String(req.body?.reason || "").trim().slice(0, 64) || (ratingRaw > 0 ? "helpful" : "other");
    const assistantMessage = String(req.body?.assistantMessage || "").trim().slice(0, 8000);
    const createdAt = String(req.body?.createdAt || new Date().toISOString());
    const entry = {
      type: "message_feedback",
      rating: ratingRaw,
      reason,
      mode,
      studyMode,
      assistantMessage,
      createdAt,
      receivedAt: new Date().toISOString(),
    };
    const line = `${JSON.stringify(entry)}\n`;

    const userId = req.user?.id || "";
    const dbResult = await persistFeedbackRow({
      userId,
      rating: ratingRaw,
      reason,
      mode,
      studyMode,
      assistantMessage,
      clientCreatedAt: createdAt,
    });

    if (dbResult.stored === "supabase") {
      return res.json({ ok: true, stored: "supabase" });
    }

    if (dbResult.error) {
      // eslint-disable-next-line no-console
      console.warn("[feedback] Supabase insert failed, using file fallback:", dbResult.error.message || dbResult.error);
    }

    try {
      await fs.promises.appendFile(feedbackLogPath, line, "utf8");
      return res.json({ ok: true, stored: "project" });
    } catch (e1) {
      try {
        await fs.promises.appendFile(feedbackTmpLogPath, line, "utf8");
        return res.json({ ok: true, stored: "tmp" });
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.warn("[feedback] could not persist feedback:", e1?.message || e1, e2?.message || e2);
        return res.json({ ok: true, stored: "none" });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

function aggregateFeedbackRows(rows) {
  const summary = {
    ok: true,
    total: 0,
    byRating: { positive: 0, negative: 0 },
    byReason: {},
    byMode: {},
    byStudyMode: {},
    source: "supabase",
  };
  for (const row of rows) {
    summary.total += 1;
    const r = Number(row.rating);
    if (r > 0) summary.byRating.positive += 1;
    else if (r < 0) summary.byRating.negative += 1;
    const reason = String(row.reason || "unknown");
    summary.byReason[reason] = (summary.byReason[reason] || 0) + 1;
    const mode = String(row.mode || "unknown");
    summary.byMode[mode] = (summary.byMode[mode] || 0) + 1;
    const sm = String(row.study_mode ?? row.studyMode ?? "unknown");
    summary.byStudyMode[sm] = (summary.byStudyMode[sm] || 0) + 1;
  }
  return summary;
}

app.get("/api/feedback-summary", requireSession, async (_req, res) => {
  try {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("assistant_feedback")
        .select("rating, reason, mode, study_mode")
        .limit(50000);
      if (!error && Array.isArray(data)) {
        return res.json(aggregateFeedbackRows(data));
      }
      // eslint-disable-next-line no-console
      console.warn("[feedback-summary] Supabase read failed, falling back to file:", error?.message || error);
    }

    if (!fs.existsSync(feedbackLogPath)) {
      return res.json({
        ok: true,
        total: 0,
        byRating: { positive: 0, negative: 0 },
        byReason: {},
        byMode: {},
        byStudyMode: {},
        source: "file",
      });
    }
    const raw = await fs.promises.readFile(feedbackLogPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const summary = {
      ok: true,
      total: 0,
      byRating: { positive: 0, negative: 0 },
      byReason: {},
      byMode: {},
      byStudyMode: {},
      source: "file",
    };
    for (const line of lines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      summary.total += 1;
      if (Number(row.rating) > 0) summary.byRating.positive += 1;
      else if (Number(row.rating) < 0) summary.byRating.negative += 1;
      const reason = String(row.reason || "unknown");
      summary.byReason[reason] = (summary.byReason[reason] || 0) + 1;
      const mode = String(row.mode || "unknown");
      summary.byMode[mode] = (summary.byMode[mode] || 0) + 1;
      const studyMode = String(row.studyMode || "unknown");
      summary.byStudyMode[studyMode] = (summary.byStudyMode[studyMode] || 0) + 1;
    }
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.get("/api/health", (_req, res) => {
  const indexHtmlDeployed = fs.existsSync(indexHtmlPath);
  const prod = process.env.NODE_ENV === "production";
  const base = {
    ok: true,
    hfConfigured: Boolean(HF_API_TOKEN),
    betaMessage: betaBannerText(),
    indexHtmlDeployed,
    learnVisionEnabled: ENABLE_LEARN_VISION,
    supabaseUrlConfigured: Boolean(SUPABASE_URL),
    supabaseAnonConfigured: Boolean(SUPABASE_ANON_KEY),
    /** If true, `SUPABASE_ANON_KEY` on the server is a secret key ? use publishable/anon only; sessions will fail. */
    supabaseAnonKeyIsSecretNotAllowed: SUPABASE_ANON_KEY.startsWith("sb_secret_"),
  };
  if (prod) {
    return res.json(base);
  }
  return res.json({
    ...base,
    envFileExists,
    hfModel: HF_MODEL,
    hfVisionModel: HF_MODEL_VISION || null,
    hfChatUrl: HF_CHAT_URL,
    betaTesting: BETA_TESTING,
    ...(indexHtmlDeployed
      ? {}
      : {
          deployHint:
            "Missing public/index.html on server. Commit and push the entire public/ folder, set Render Root Directory to repo root (blank), redeploy.",
        }),
  });
});

/**
 * SPA fallback for GET/HEAD outside `/api/*` (e.g. future client routes). Uses sendFile `root`
 * so paths resolve the same on Render as locally.
 */
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api")) return next();
  res.sendFile("index.html", { root: publicDir }, (err) => {
    if (err) next(err);
  });
});

const isProdBoot = process.env.NODE_ENV === "production";
if (isProdBoot && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  // eslint-disable-next-line no-console
  console.error(
    "FATAL: Missing SUPABASE_URL or SUPABASE_ANON_KEY. In production, set both in your host (e.g. Render: Web Service -> Environment). Copy from Supabase: Project Settings -> API (Project URL and anon public key).",
  );
  process.exit(1);
}

app.listen(PORT, () => {
  const isProd = process.env.NODE_ENV === "production";
  // eslint-disable-next-line no-console
  console.log(`Student AI Hub listening on port ${PORT}`);
  if (!isProd) {
    // eslint-disable-next-line no-console
    console.log(`Local .env path (optional): ${envPath}`);
    // eslint-disable-next-line no-console
    console.log(envFileExists ? ".env file found." : ".env file not found (use .env.example as a template).");
  } else {
    // eslint-disable-next-line no-console
    console.log("Production: secrets come from the host (e.g. Render Environment), not from a committed .env file.");
  }
  // eslint-disable-next-line no-console
  console.log(
    HF_API_TOKEN
      ? `Hugging Face token loaded (${HF_MODEL} via ${HF_CHAT_URL}).`
      : isProd
        ? "Hugging Face token missing ? set HF_API_TOKEN in Render (Environment) and redeploy."
        : "Hugging Face token missing ? add HF_API_TOKEN to .env next to server.js for real AI."
  );
});
