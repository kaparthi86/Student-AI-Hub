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

/** Live web grounding for Ask (learn mode). Prefer Tavily; Brave/Serper also supported. */
const TAVILY_API_KEY = normalizeEnvString(process.env.TAVILY_API_KEY || "");
const BRAVE_SEARCH_API_KEY = normalizeEnvString(process.env.BRAVE_SEARCH_API_KEY || "");
const SERPER_API_KEY = normalizeEnvString(process.env.SERPER_API_KEY || "");
const LIVE_WEB_MAX_RESULTS = Math.max(1, Math.min(8, Number(process.env.LIVE_WEB_MAX_RESULTS || 5) || 5));
const LIVE_WEB_CONFIGURED = Boolean(TAVILY_API_KEY || BRAVE_SEARCH_API_KEY || SERPER_API_KEY);

/** OpenAI-compatible chat completions endpoint (Inference Providers / Router). */
const HF_CHAT_URL =
  normalizeEnvString(process.env.HF_CHAT_URL) || "https://router.huggingface.co/v1/chat/completions";
const envFileExists = fs.existsSync(envPath);

const MAX_DOC_CHARS = 45000;
const MAX_CHAT_HISTORY = 24;
const MAX_NOTEBOOK_FILES = 5;

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

function writeSseHeaders(res) {
  if (res.headersSent) return;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function writeSseData(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendSseSingleChunk(res, text) {
  writeSseHeaders(res);
  writeSseData(res, { choices: [{ delta: { content: text } }] });
  res.write("data: [DONE]\n\n");
  res.end();
}

/**
 * Replay archived provider SSE. A single res.end(blob) often arrives as one fetch read(), so the
 * client parses every data: line in one turn and streaming UI does not update incrementally.
 */
async function replayCachedSseResponse(res, archivedUtf8) {
  writeSseHeaders(res);
  const s = String(archivedUtf8);
  const step = 4096;
  for (let i = 0; i < s.length; i += step) {
    res.write(s.slice(i, Math.min(s.length, i + step)));
    if (i + step < s.length) await new Promise((r) => setImmediate(r));
  }
  res.end();
}

/** Tee provider SSE: stream to client and store raw bytes for identical replay (same cache key as stream hits). */
function pipeProviderSseWithArchive(res, hfResBody, streamCacheHash, { skipArchive = false } = {}) {
  if (!hfResBody || typeof hfResBody.tee !== "function") return false;
  if (!skipArchive && !RESPONSE_CACHE_TTL_MS) return false;
  try {
    const useArchive = !skipArchive && RESPONSE_CACHE_TTL_MS > 0;
    const [toClient, toArchive] = useArchive ? hfResBody.tee() : [hfResBody, null];
    writeSseHeaders(res);

    const nodeClient = Readable.fromWeb(toClient);
    res.on("close", () => nodeClient.destroy());
    nodeClient.on("error", () => {
      if (!res.writableEnded) res.end();
    });
    nodeClient.pipe(res);

    if (useArchive && toArchive) {
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
    }

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
  if (!admin) {
    return {
      stored: null,
      error: new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not set on the server. Feedback cannot be written to Supabase.",
      ),
    };
  }
  if (!userId) {
    return { stored: null, error: new Error("Missing authenticated user id for feedback insert.") };
  }

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
  if (error) {
    const msg = String(error.message || error);
    const hint =
      /Could not find the table|relation .* does not exist|schema cache/i.test(msg)
        ? " Run supabase/assistant_feedback.sql in the Supabase SQL Editor."
        : "";
    return { stored: null, error: new Error(`${msg}${hint}`) };
  }
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
      if (filePath.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return;
      }
      // Versioned static assets (?v=...) are safe to cache briefly at the edge/browser.
      if (/\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
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
app.get("/privacy-agent", (_req, res) => {
  res.redirect(302, "/privacy-agent/");
});
app.get("/privacy-agent/", (_req, res) => {
  res.sendFile("privacy-agent/index.html", { root: publicDir });
});

const houseDnsLib = require("./privacy-agent-dns/lib");
const houseDnsRuntime = houseDnsLib.createRuntime();

function houseDnsUnavailableOnCloud(res) {
  return res.status(400).json({
    ok: false,
    cloud: true,
    error:
      "The house filter has to run on a computer in your home, not on the public website. Open AI Hub on that computer (http://localhost:3001/privacy-agent/) and tap Protect this house.",
  });
}

app.get("/api/privacy-dns/status", (req, res) => {
  res.json(
    houseDnsRuntime.status({
      cloud: houseDnsLib.isCloudHost(),
      homeRequest: houseDnsLib.isHomeRequest(req),
    })
  );
});

app.post("/api/privacy-dns/start", async (req, res) => {
  if (houseDnsLib.isCloudHost()) return houseDnsUnavailableOnCloud(res);
  if (!houseDnsLib.isHomeRequest(req)) {
    return res.status(403).json({ ok: false, error: "Start the house filter from a device on this home network." });
  }
  const requested = Number(req.body?.port || process.env.PRIVACY_DNS_PORT || 53);
  try {
    const snapshot = await houseDnsRuntime.start({ port: requested });
    return res.json(snapshot);
  } catch (err) {
    const needsAdmin = requested === 53 || /eacces|eaddrinuse/i.test(String(err.message || ""));
    return res.status(409).json({
      ok: false,
      needsAdmin,
      error: err.message || "Could not start the house filter.",
      hint: needsAdmin
        ? "Close AI Hub, start it with administrator rights (sudo npm run dev on Mac/Linux), then tap Protect this house again."
        : "Another app may already be using DNS on this computer.",
    });
  }
});

app.post("/api/privacy-dns/stop", async (req, res) => {
  if (houseDnsLib.isCloudHost()) return houseDnsUnavailableOnCloud(res);
  if (!houseDnsLib.isHomeRequest(req)) {
    return res.status(403).json({ ok: false, error: "Stop the house filter from a device on this home network." });
  }
  const snapshot = await houseDnsRuntime.stop();
  return res.json(snapshot);
});

app.post("/api/privacy-dns/rules", (req, res) => {
  if (houseDnsLib.isCloudHost()) return houseDnsUnavailableOnCloud(res);
  if (!houseDnsLib.isHomeRequest(req)) {
    return res.status(403).json({ ok: false, error: "Update house rules from a device on this home network." });
  }
  return res.json(houseDnsRuntime.setRules(req.body || {}));
});

app.get("/api/privacy-dns/hosts.txt", (req, res) => {
  res.type("text/plain").send(houseDnsRuntime.hostsText());
});

app.get("/api/privacy-dns/domains.txt", (req, res) => {
  res.type("text/plain").send(houseDnsRuntime.domainsText());
});

if (!houseDnsLib.isCloudHost()) {
  houseDnsRuntime.start({ port: Number(process.env.PRIVACY_DNS_PORT || 53) }).catch(() => {
    /* Port 53 usually needs admin. The Privacy Agent Start button reports this. */
  });
}

function buildPrompt(mode, userInput) {
  if (mode === "code") {
    return `${chatSystemBase("code")}\n\nStudent request:\n${userInput}`;
  }
  return `${chatSystemBase("learn")}\n\nStudent request:\n${userInput}`;
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
const NOTEBOOK_SYSTEM_STATIC = `You create accurate student study materials. Never invent facts not present in the source materials.

You are Student AI Notebook inside AI Hub.

Response contract for Notebook analyze (follow strictly):
1) Use ONLY the source materials in the user message. If something is missing, write "Not in document" - never invent facts.
2) Output exactly these ## sections in order, nothing else before section 1:
## Executive summary
## Key concepts
## Formulas and procedures
## Practice checks
## 7-day study plan
3) Executive summary: 5-8 hyphen bullets, concrete and short.
4) Key concepts: hyphen bullets with plain definitions (no decorative bold asterisks).
5) Formulas and procedures: numbered steps when sequential; if none, one line: None obvious.
6) Practice checks: exactly 5 short learning checks (not graded-exam items) with brief answers under each.
7) 7-day study plan: Day 1 ... Day 7, one short task per day.
8) When multiple files are present, synthesize and name the source file when a point is document-specific.
9) No filler openers. No **bold** or *italic* asterisk decoration. Prefer ## headings and hyphen/number lists only.
10) End when the sections are complete - do not add extra pep talks.`;

const NOTEBOOK_FOLLOWUP_SYSTEM = `You are Student AI Notebook inside AI Hub - a document-grounded study coach.
Answer ONLY using the SOURCE MATERIALS provided below.
If the answer is not supported by those materials, say "Not in document" instead of guessing.
When multiple sources are present, synthesize across them and name the source file when helpful.
If asked which product or model produced this response, answer: "This answer is from AI Hub (Student AI)." You may add that AI can be wrong and important facts should be checked. Never claim to be Perplexity, ChatGPT, Claude, Google, or any other brand.

Response contract for Notebook follow-ups (follow strictly):
1) Start with a direct answer in 1-2 sentences. Do not restate the question.
2) Then only useful detail from the sources: numbered steps for procedures, or hyphen bullets for lists.
3) Prefer one concrete example from the notes when it helps; keep paragraphs short.
4) No filler openers (avoid Great question, Sure, As an AI, Based on the document you uploaded).
5) No decorative **bold** or *italic* asterisks. Use ## only when a real section title helps.
6) End when the student can act. Do not invent citations, page numbers, or facts not in the sources.`;

function notebookUserContent(docName, docText) {
  return notebookUserContentFromSources([{ name: docName, text: docText }]);
}

/**
 * Build a multi-document prompt body and a reusable documentContext string for follow-ups.
 * @param {{ name: string, text: string }[]} sourceDocs
 */
function buildNotebookCorpus(sourceDocs) {
  const list = Array.isArray(sourceDocs) ? sourceDocs.filter((d) => d && String(d.text || "").trim()) : [];
  if (!list.length) {
    return { documentContext: "", userContent: "", sources: [], charsUsed: 0, corpusHash: "" };
  }

  let remaining = MAX_DOC_CHARS;
  const parts = [];
  const sources = [];
  let charsUsed = 0;

  list.forEach((doc, idx) => {
    const name = String(doc.name || `document-${idx + 1}`).slice(0, 240);
    const full = String(doc.text || "");
    if (!full.trim() || remaining <= 0) {
      sources.push({ name, chars: 0, included: Boolean(full.trim()) });
      return;
    }
    const slice = full.slice(0, remaining);
    const truncated = slice.length < full.length;
    remaining -= slice.length;
    charsUsed += slice.length;
    sources.push({ name, chars: slice.length, truncated });
    parts.push(
      `--- DOCUMENT ${idx + 1} START ---\nName: "${name}"\nText:\n${slice}${
        truncated ? "\n\n[Document truncated for length.]" : ""
      }\n--- DOCUMENT ${idx + 1} END ---`
    );
  });

  const documentContext = parts.join("\n\n");
  const names = sources.map((s) => s.name).join(", ");
  const userContent = `Documents uploaded (${sources.length}): ${names}\n\n${documentContext}`;
  const corpusHash = crypto.createHash("sha256").update(documentContext).digest("hex");
  return { documentContext, userContent, sources, charsUsed, corpusHash };
}

function notebookUserContentFromSources(sourceDocs) {
  return buildNotebookCorpus(sourceDocs).userContent;
}

function collectNotebookUploadFiles(req) {
  const out = [];
  if (Array.isArray(req.files)) {
    out.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    if (Array.isArray(req.files.documents)) out.push(...req.files.documents);
    if (Array.isArray(req.files.document)) out.push(...req.files.document);
  }
  if (req.file) out.push(req.file);

  const deduped = [];
  const seen = new Set();
  for (const f of out) {
    if (!f?.buffer) continue;
    const key = `${f.originalname || "upload"}:${f.size || f.buffer.length}:${f.mimetype || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
    if (deduped.length >= MAX_NOTEBOOK_FILES) break;
  }
  return deduped;
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


function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(s);
}

function sanitizeWebSource(row) {
  const title = String(row?.title || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const url = String(row?.url || "").trim().slice(0, 500);
  const snippet = String(row?.snippet || "").replace(/\s+/g, " ").trim().slice(0, 420);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return { title: title || url, url, snippet };
}

async function searchWithTavily(query) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: LIVE_WEB_MAX_RESULTS,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tavily search failed: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows = Array.isArray(data?.results) ? data.results : [];
  return rows
    .map((r) => sanitizeWebSource({ title: r.title, url: r.url, snippet: r.content || r.snippet }))
    .filter(Boolean)
    .slice(0, LIVE_WEB_MAX_RESULTS);
}

async function searchWithBrave(query) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(LIVE_WEB_MAX_RESULTS));
  const res = await fetch(url.href, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Brave search failed: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows = Array.isArray(data?.web?.results) ? data.web.results : [];
  return rows
    .map((r) => sanitizeWebSource({ title: r.title, url: r.url, snippet: r.description }))
    .filter(Boolean)
    .slice(0, LIVE_WEB_MAX_RESULTS);
}

async function searchWithSerper(query) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": SERPER_API_KEY,
    },
    body: JSON.stringify({ q: query, num: LIVE_WEB_MAX_RESULTS }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Serper search failed: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows = Array.isArray(data?.organic) ? data.organic : [];
  return rows
    .map((r) => sanitizeWebSource({ title: r.title, url: r.link, snippet: r.snippet }))
    .filter(Boolean)
    .slice(0, LIVE_WEB_MAX_RESULTS);
}

async function fetchLiveWebSources(query) {
  const q = String(query || "").trim().slice(0, 400);
  if (!q || !LIVE_WEB_CONFIGURED) return [];
  try {
    if (TAVILY_API_KEY) return await searchWithTavily(q);
    if (BRAVE_SEARCH_API_KEY) return await searchWithBrave(q);
    if (SERPER_API_KEY) return await searchWithSerper(q);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Live web search failed:", err?.message || err);
    return [];
  }
  return [];
}

function buildLiveWebSystemAppendix(sources) {
  if (!sources.length) {
    return [
      "Live web was requested, but no fresh web results were available for this question.",
      "Answer from general knowledge and say clearly when you are unsure or when facts may be outdated.",
    ].join(" ");
  }
  const blocks = sources.map((s, i) => {
    const n = i + 1;
    return `[${n}] ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet || "(none)"}`;
  });
  return [
    "You have fresh web search snippets below. Ground factual claims in them when relevant.",
    "Cite sources inline like [1], [2] matching the numbers. Prefer primary/reputable sources.",
    "If snippets conflict or are thin, say what is uncertain. Do not invent URLs.",
    "Keep the calm study-coach tone. Do not dump raw search results.",
    "",
    "--- WEB RESULTS ---",
    blocks.join("\n\n"),
    "--- END WEB RESULTS ---",
  ].join("\n");
}

function responseContractInstruction(mode) {
  const shared = [
    "Response contract (follow strictly):",
    "1) Start with a direct answer in 1-2 sentences. Do not restate the question.",
    "2) Then add only useful detail: numbered steps (1. 2. 3.) for processes, or hyphen bullets (-) for lists.",
    "3) Prefer one concrete example over vague advice. Keep paragraphs to 1-3 short sentences.",
    "4) No filler openers (avoid So, Great question, Sure, Absolutely, As an AI, I'd be happy to).",
    "5) No decorative **bold** or *italic* asterisks. Use ## headings sparingly and only with real titles.",
    "6) Stay within scope: teach and practice help only - do not write work the student should submit as their own.",
    "7) End when the student can act. Do not pad with generic encouragement or recap fluff.",
  ];
  if (mode === "finance") {
    return [
      "Response contract (follow strictly):",
      "1) Start with a direct answer in 1-2 sentences. Do not restate the question.",
      "2) Then add only useful detail: numbered steps (1. 2. 3.) for processes, or hyphen bullets (-) for lists.",
      "3) Prefer one concrete example over vague advice. Keep paragraphs to 1-3 short sentences.",
      "4) No filler openers (avoid So, Great question, Sure, Absolutely, As an AI, I'd be happy to).",
      "5) No decorative **bold** or *italic* asterisks. Use ## headings sparingly and only with real titles.",
      "6) Educational only - not financial, tax, investment, or legal advice. Never recommend a specific stock, crypto token, fund ticker, or broker.",
      "7) Never promise returns, credit approval, or debt-relief outcomes.",
      "8) If the user shares account numbers, passwords, or SSNs, tell them to remove that information and not send secrets.",
      "9) When they provide numbers, do the arithmetic clearly (leftover, monthly save, simple percentages).",
      "10) End when they can take a small next step. For high-stakes topics, one short line: talk to a qualified professional for personal decisions.",
    ].join(" ");
  }
  if (mode === "code") {
    return [
      ...shared,
      "Code contract:",
      "8) Lead with the fix or working idea in plain language.",
      "9) Then one minimal Markdown code fence (only the smallest useful snippet).",
      "10) Then 2-4 brief why-it-works or how-to-verify notes as numbered steps or short bullets.",
      "11) If the student pasted an error, name the likely cause before showing code.",
      "12) Do not dump large unrelated files or multiple alternate full solutions unless asked.",
    ].join(" ");
  }
  if (mode === "notebook") {
    return [
      ...shared,
      "Notebook contract:",
      "8) Use only provided source materials; otherwise say Not in document.",
      "9) Prefer steps and bullets grounded in the notes; name the source file when useful.",
    ].join(" ");
  }
  // learn / Ask
  return [
    ...shared,
    "Ask contract:",
    "8) Teach the smallest useful explanation after the direct answer - typically under ~180 words unless the student asks for depth.",
    "9) If the topic is multi-step, use numbered steps with one idea each.",
    "10) If a common misconception exists, call it out in one short line.",
  ].join(" ");
}

function chatSystemBase(mode) {
  const identity =
    'You are Student AI inside AI Hub. If asked which product or model produced this response, answer: "This answer is from AI Hub (Student AI)." You may briefly add that AI can be wrong and important facts should be checked. Never claim to be Perplexity, ChatGPT, Claude, Google, or any other brand.';
  if (mode === "finance") {
    return [
      "You are Finance AI inside AI Hub - a calm money-planning coach for everyday people, including students.",
      'If asked which product or model produced this response, answer: "This answer is from AI Hub (Finance AI)." You may briefly add that AI can be wrong and this is not financial advice. Never claim to be Perplexity, ChatGPT, Claude, Google, a bank, or any other brand.',
      responseContractInstruction("finance"),
      "Prefer simple budgets, emergency funds, and goal math over complex products. Treat amounts as the user's local units unless they name a currency.",
    ].join(" ");
  }
  if (mode === "code") {
    return [
      "You are a patient coding tutor for students in Student AI (AI Hub).",
      identity,
      responseContractInstruction("code"),
      "Use Markdown code fences for code only. Use numbered steps for procedures. Use hyphen bullets (-) for lists.",
    ].join(" ");
  }
  return [
    "You are a calm study coach for students in Student AI (AI Hub).",
    identity,
    responseContractInstruction("learn"),
    "Default posture: answer first, then the smallest useful explanation.",
  ].join(" ");
}

function modeStyleInstruction(studyMode) {
  // Quiz UI was removed; keep explain as the only style path for chat.
  void studyMode;
  return [
    "Style: Explain.",
    "Honor the response contract above on every turn.",
    "If the idea has a sequence, use numbered steps (1. 2. 3.), one idea per step.",
    "Otherwise use short clean paragraphs or hyphen bullets. Avoid markdown clutter.",
  ].join(" ");
}

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

const PRACTICE_START_SYSTEM = `You create short honor-code-first practice checks for students.
Return ONLY valid JSON (no markdown, no commentary) with this exact shape:
{"topic":"short topic label","questions":[{"id":1,"prompt":"question text","rubric":"brief ideal answer points"}]}
Rules:
- Exactly 5 questions, mix easy and medium.
- Questions should check understanding and practice, not help students cheat on graded exams.
- For coding topics: ask about concepts, debugging reasoning, and what to try next — do not ask students to paste full graded assignment solutions.
- Keep prompts short (1-2 sentences). Rubric is for the grader only (key points).
- If source materials are provided, use ONLY those materials. If a fact is missing, avoid inventing it.
- No **bold asterisks**.`;

const PRACTICE_CHECK_SYSTEM = `You grade one student practice answer for learning (not high-stakes testing).
Return ONLY valid JSON:
{"correct":true,"feedback":"1-2 short sentences","key_point":"the main idea to remember"}
Rules:
- correct=true if the student got the core idea, even if wording differs.
- Be encouraging but honest. No **bold asterisks**.
- Do not reveal a full essay answer; keep feedback brief.`;

const PRACTICE_WRAPUP_SYSTEM = `You summarize a short practice session for a student.
Return ONLY valid JSON:
{"mistakes":[{"question":"...","what_went_wrong":"...","relearn":"..."}],"next_best_step":"one concrete next action","encouragement":"one short line"}
Rules:
- Include at most 3 mistakes (the most important). If none, mistakes=[].
- next_best_step must be a single actionable study step.
- Honor-code first: frame as learning/practice, not exam shortcuts.
- No **bold asterisks**.`;

function demoPracticeStart(topic) {
  const label = String(topic || "General review").slice(0, 80);
  return {
    topic: label,
    questions: [
      {
        id: 1,
        prompt: `In your own words, what is the main idea of "${label}"?`,
        rubric: "States the core concept clearly in one or two sentences.",
      },
      {
        id: 2,
        prompt: `Give one real example that shows "${label}" in use.`,
        rubric: "Provides a concrete, relevant example.",
      },
      {
        id: 3,
        prompt: `What is a common mistake students make with "${label}"?`,
        rubric: "Names a plausible misconception and why it is wrong.",
      },
      {
        id: 4,
        prompt: `Explain one step or detail someone must get right for "${label}".`,
        rubric: "Mentions a specific critical step or detail.",
      },
      {
        id: 5,
        prompt: `How would you check that you understand "${label}"?`,
        rubric: "Suggests a quick self-check or question.",
      },
    ],
  };
}

function normalizeUiLanguage(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (["en", "es", "hi", "te"].includes(v)) return v;
  return "en";
}

function uiLanguageInstruction(rawLang) {
  const lang = normalizeUiLanguage(rawLang);
  if (lang === "en") return "Respond in English unless the student explicitly asks for another language.";
  if (lang === "es") return "Responde en espanol claro y sencillo, salvo que el estudiante pida otro idioma.";
  if (lang === "hi") return "Jawab Hindi mein dein, jab tak vidyarthi kisi aur bhasha ki maang na kare.";
  if (lang === "te") return "Vidyarthi vere bhaasha adigithe tappaa, samadhanalu Telugu lo ivvandi.";
  return "Respond in English unless the student explicitly asks for another language.";
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
    const uiLanguage = normalizeUiLanguage(req.body?.uiLanguage);
    if (!input) return res.status(400).json({ error: "Input is required." });

    const uid = req.user?.id || "";
    const output = await queryModelSingle(mode, `${uiLanguageInstruction(uiLanguage)}\n\n${input}`, {
      cacheUserKey: uid,
      promptCacheKey: `${uid}:${mode}:ai`,
    });
    return res.json({ output });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/practice", requireSession, async (req, res) => {
  try {
    const action = String(req.body?.action || "").trim().toLowerCase();
    const uiLanguage = normalizeUiLanguage(req.body?.uiLanguage);
    const cacheUserKey = req.user?.id || "";
    const documentContext = String(req.body?.documentContext || "")
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, MAX_DOC_CHARS + 4000);
    const topic = String(req.body?.topic || "").trim().slice(0, 200);
    const source = String(req.body?.source || "").trim().toLowerCase();

    if (!["start", "check", "wrapup"].includes(action)) {
      return res.status(400).json({ error: "action must be start, check, or wrapup." });
    }

    if (action === "start") {
      if (!documentContext && !topic) {
        return res.status(400).json({
          error: "Provide documentContext (from Notebook) or a topic to start Practice.",
        });
      }
      if (!HF_API_TOKEN) {
        return res.json({ ok: true, ...demoPracticeStart(topic || "Your notes") });
      }
      const topicPrompt =
        source === "code"
          ? `Create 5 short practice questions that check understanding of this coding/debugging topic (concepts, why it works, what to try next — not full graded homework solutions):\n${topic}`
          : `Create 5 practice questions on this topic: ${topic}`;
      const userParts = [
        documentContext
          ? `Create 5 practice questions from these SOURCE MATERIALS only:\n---\n${documentContext}\n---`
          : topicPrompt,
        uiLanguageInstruction(uiLanguage),
      ];
      const raw = await callChatCompletion(
        [
          { role: "system", content: PRACTICE_START_SYSTEM },
          { role: "user", content: userParts.join("\n\n") },
        ],
        {
          max_tokens: 900,
          temperature: 0.4,
          cacheUserKey,
          promptCacheKey: `${cacheUserKey}:practice:start:${crypto
            .createHash("sha256")
            .update(documentContext || topic)
            .digest("hex")
            .slice(0, 24)}`,
        },
      );
      const parsed = extractJsonObject(raw);
      const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
      const cleaned = questions
        .map((q, i) => ({
          id: Number(q?.id) || i + 1,
          prompt: String(q?.prompt || "").trim().slice(0, 500),
          rubric: String(q?.rubric || "").trim().slice(0, 400),
        }))
        .filter((q) => q.prompt)
        .slice(0, 5);
      if (cleaned.length < 3) {
        return res.status(502).json({ error: "Could not build a practice set. Try again." });
      }
      return res.json({
        ok: true,
        topic: String(parsed?.topic || topic || "Practice").trim().slice(0, 120),
        questions: cleaned,
      });
    }

    if (action === "check") {
      const prompt = String(req.body?.question?.prompt || req.body?.prompt || "").trim().slice(0, 500);
      const rubric = String(req.body?.question?.rubric || req.body?.rubric || "").trim().slice(0, 400);
      const answer = String(req.body?.answer || "").trim().slice(0, 2000);
      if (!prompt || !answer) {
        return res.status(400).json({ error: "question prompt and answer are required." });
      }
      if (!HF_API_TOKEN) {
        const looksThin = answer.length < 12;
        return res.json({
          ok: true,
          correct: !looksThin,
          feedback: looksThin
            ? "Demo mode: add a bit more detail so we can check your understanding."
            : "Demo mode: looks like a reasonable attempt. Add HF_API_TOKEN for real grading.",
          key_point: rubric || "Restate the core idea in your own words.",
        });
      }
      const raw = await callChatCompletion(
        [
          { role: "system", content: PRACTICE_CHECK_SYSTEM },
          {
            role: "user",
            content: [
              `Question: ${prompt}`,
              `Rubric: ${rubric || "(use general understanding)"}`,
              `Student answer: ${answer}`,
              uiLanguageInstruction(uiLanguage),
            ].join("\n"),
          },
        ],
        {
          max_tokens: 280,
          temperature: 0.2,
          cacheUserKey,
          promptCacheKey: `${cacheUserKey}:practice:check`,
        },
      );
      const parsed = extractJsonObject(raw) || {};
      return res.json({
        ok: true,
        correct: Boolean(parsed.correct),
        feedback: String(parsed.feedback || "Thanks — review the key point and try a clearer answer next time.")
          .trim()
          .slice(0, 500),
        key_point: String(parsed.key_point || rubric || "").trim().slice(0, 300),
      });
    }

    // wrapup
    const results = Array.isArray(req.body?.results) ? req.body.results.slice(0, 8) : [];
    if (!results.length) {
      return res.status(400).json({ error: "results array is required for wrapup." });
    }
    const compact = results.map((r, i) => ({
      n: i + 1,
      question: String(r?.question || r?.prompt || "").trim().slice(0, 300),
      answer: String(r?.answer || "").trim().slice(0, 400),
      correct: Boolean(r?.correct),
      feedback: String(r?.feedback || "").trim().slice(0, 300),
    }));
    if (!HF_API_TOKEN) {
      const misses = compact.filter((r) => !r.correct);
      return res.json({
        ok: true,
        mistakes: misses.slice(0, 3).map((m) => ({
          question: m.question,
          what_went_wrong: m.feedback || "This one still needs another pass.",
          relearn: "Re-read your notes on this idea, then retry the question in your own words.",
        })),
        next_best_step:
          misses.length > 0
            ? "Revisit the missed ideas in Notebook or Ask, then run Practice again."
            : "Raise the difficulty: explain the topic to a friend or invent two new quiz questions.",
        encouragement: "Nice work completing a practice loop.",
      });
    }
    const raw = await callChatCompletion(
      [
        { role: "system", content: PRACTICE_WRAPUP_SYSTEM },
        {
          role: "user",
          content: `Practice results JSON:\n${JSON.stringify(compact)}\n\n${uiLanguageInstruction(uiLanguage)}`,
        },
      ],
      {
        max_tokens: 500,
        temperature: 0.35,
        cacheUserKey,
        promptCacheKey: `${cacheUserKey}:practice:wrapup`,
      },
    );
    const parsed = extractJsonObject(raw) || {};
    const mistakes = Array.isArray(parsed.mistakes)
      ? parsed.mistakes
          .map((m) => ({
            question: String(m?.question || "").trim().slice(0, 300),
            what_went_wrong: String(m?.what_went_wrong || "").trim().slice(0, 300),
            relearn: String(m?.relearn || "").trim().slice(0, 300),
          }))
          .filter((m) => m.question || m.what_went_wrong)
          .slice(0, 3)
      : [];
    return res.json({
      ok: true,
      mistakes,
      next_best_step: String(
        parsed.next_best_step || "Review the missed ideas once, then retry Practice.",
      )
        .trim()
        .slice(0, 300),
      encouragement: String(parsed.encouragement || "Good effort — practice beats cramming.")
        .trim()
        .slice(0, 200),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/chat", requireSession, async (req, res) => {
  try {
    const modeRaw = String(req.body?.mode || "").trim().toLowerCase();
    const mode =
      modeRaw === "code" ? "code" : modeRaw === "notebook" ? "notebook" : modeRaw === "finance" ? "finance" : "learn";
    const uiLanguage = normalizeUiLanguage(req.body?.uiLanguage);
    const studyMode = "explain";
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

    let documentContext = "";
    if (mode === "notebook") {
      documentContext = String(req.body?.documentContext || "")
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, MAX_DOC_CHARS + 4000);
      if (!documentContext) {
        return res.status(400).json({
          error: "documentContext is required for notebook follow-ups. Analyze your notes first.",
        });
      }
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

    const liveWebRequested = mode === "learn" && isTruthyFlag(req.body?.liveWeb);
    let webSources = [];
    if (liveWebRequested && LIVE_WEB_CONFIGURED) {
      webSources = await fetchLiveWebSources(lastMessage);
    }

    let system =
      mode === "notebook"
        ? `${NOTEBOOK_FOLLOWUP_SYSTEM}\n${modeStyleInstruction(studyMode)}\n${uiLanguageInstruction(
            uiLanguage
          )}\n\n--- SOURCE MATERIALS ---\n${documentContext}\n--- END SOURCE MATERIALS ---`
        : `${chatSystemBase(mode)}\n${modeStyleInstruction(studyMode)}\n${uiLanguageInstruction(uiLanguage)}`;
    if (liveWebRequested) {
      system = `${system}\n\n${buildLiveWebSystemAppendix(webSources)}`;
    }
    const coreMessages = [...historyApi, { role: "user", content: lastUserContent }];
    const modelForRequest = pickChatModelForMessages(coreMessages);
    const messages = [{ role: "system", content: system }, ...coreMessages];
    const cacheUserKey = req.user?.id || "";
    const webHash = liveWebRequested
      ? crypto.createHash("sha256").update(JSON.stringify(webSources)).digest("hex").slice(0, 16)
      : "";
    const promptCacheKey =
      mode === "notebook"
        ? `${cacheUserKey}:notebook:${crypto.createHash("sha256").update(documentContext).digest("hex").slice(0, 24)}:${studyMode}`
        : `${cacheUserKey}:${mode}:${studyMode}${webHash ? `:web:${webHash}` : ""}`;
    const streamCacheHash = buildCompletionCacheHash(cacheUserKey, messages, "sse", modelForRequest);
    const visionTurn = messagesIncludeImages(coreMessages);
    const maxOutTokens = visionTurn ? 1100 : mode === "notebook" ? 900 : liveWebRequested ? 900 : 720;
    const skipResponseCache = liveWebRequested;

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
        writeSseHeaders(res);
        if (liveWebRequested) {
          writeSseData(res, { studentAiMeta: { sources: webSources, liveWeb: true } });
        }
        writeSseData(res, { choices: [{ delta: { content: demo } }] });
        res.write("data: [DONE]\n\n");
        res.end();
      };

      if (!HF_API_TOKEN) {
        demoLine();
        return;
      }

      if (!skipResponseCache && RESPONSE_CACHE_TTL_MS) {
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

      writeSseHeaders(res);
      if (liveWebRequested) {
        writeSseData(res, { studentAiMeta: { sources: webSources, liveWeb: true } });
      }

      if (pipeProviderSseWithArchive(res, hfRes.body, streamCacheHash, { skipArchive: skipResponseCache })) {
        return;
      }

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
    return res.json({ output, sources: liveWebRequested ? webSources : undefined, liveWeb: liveWebRequested || undefined });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post(
  "/api/doc-insights",
  requireSession,
  upload.fields([
    { name: "documents", maxCount: MAX_NOTEBOOK_FILES },
    { name: "document", maxCount: MAX_NOTEBOOK_FILES },
  ]),
  async (req, res) => {
    try {
      const files = collectNotebookUploadFiles(req);
      if (!files.length) {
        return res.status(400).json({
          error: `No file uploaded. Use field "documents" (up to ${MAX_NOTEBOOK_FILES} files) or "document".`,
        });
      }

      const extracted = [];
      const failures = [];
      for (const file of files) {
        const name = file.originalname || "document";
        try {
          const text = await extractTextFromUpload(file);
          if (!text) {
            failures.push({ name, error: "Could not extract text from this file." });
            continue;
          }
          extracted.push({ name, text });
        } catch (e) {
          failures.push({ name, error: e.message || "Could not read file." });
        }
      }

      if (!extracted.length) {
        return res.status(400).json({
          error: failures[0]?.error || "Could not extract text from the uploaded files.",
          failures,
        });
      }

      const corpus = buildNotebookCorpus(extracted);
      const uid = req.user?.id || "";
      const cacheUserKey = `${uid}:${corpus.corpusHash}`;

      const output = await callChatCompletion(
        [
          { role: "system", content: NOTEBOOK_SYSTEM_STATIC },
          { role: "user", content: corpus.userContent },
        ],
        {
          max_tokens: 1400,
          temperature: 0.35,
          cacheUserKey,
          promptCacheKey: `notebook:${corpus.corpusHash.slice(0, 40)}`,
        }
      );

      const docNames = corpus.sources.map((s) => s.name);
      return res.json({
        output,
        docName: docNames[0] || "document",
        docNames,
        sources: corpus.sources,
        charsUsed: corpus.charsUsed,
        documentContext: corpus.documentContext,
        failures: failures.length ? failures : undefined,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Unexpected error" });
    }
  }
);

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
    const mode =
      req.body?.mode === "code"
        ? "code"
        : req.body?.mode === "notebook"
          ? "notebook"
          : req.body?.mode === "finance"
            ? "finance"
            : "learn";
    const studyModeRaw = String(req.body?.studyMode || "explain").toLowerCase().slice(0, 32);
    const studyMode = ["explain", "practice", "quiz"].includes(studyModeRaw) ? studyModeRaw : "explain";
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
      console.warn(
        "[feedback] Supabase insert failed, using file fallback:",
        dbResult.error.message || dbResult.error,
      );
    }

    try {
      await fs.promises.appendFile(feedbackLogPath, line, "utf8");
      return res.json({
        ok: true,
        stored: "project",
        warning:
          dbResult.error?.message ||
          "Saved to server file only. Set SUPABASE_SERVICE_ROLE_KEY and create public.assistant_feedback to see rows in Supabase.",
      });
    } catch (e1) {
      try {
        await fs.promises.appendFile(feedbackTmpLogPath, line, "utf8");
        return res.json({
          ok: true,
          stored: "tmp",
          warning:
            dbResult.error?.message ||
            "Saved to /tmp only (ephemeral on Render). Configure Supabase feedback table + service role key.",
        });
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.warn("[feedback] could not persist feedback:", e1?.message || e1, e2?.message || e2);
        return res.json({
          ok: true,
          stored: "none",
          warning: dbResult.error?.message || "Feedback was not persisted.",
        });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

function aggregateFeedbackRows(rows, { source = "supabase", days = null } = {}) {
  const summary = {
    ok: true,
    total: 0,
    byRating: { positive: 0, negative: 0 },
    byReason: {},
    byMode: {},
    byStudyMode: {},
    topNegativeReasons: [],
    source,
    days: days == null ? null : days,
  };
  const negReasons = {};
  for (const row of rows) {
    summary.total += 1;
    const r = Number(row.rating);
    if (r > 0) summary.byRating.positive += 1;
    else if (r < 0) {
      summary.byRating.negative += 1;
      const reason = String(row.reason || "unknown");
      negReasons[reason] = (negReasons[reason] || 0) + 1;
    }
    const reason = String(row.reason || "unknown");
    summary.byReason[reason] = (summary.byReason[reason] || 0) + 1;
    const mode = String(row.mode || "unknown");
    summary.byMode[mode] = (summary.byMode[mode] || 0) + 1;
    const sm = String(row.study_mode ?? row.studyMode ?? "unknown");
    summary.byStudyMode[sm] = (summary.byStudyMode[sm] || 0) + 1;
  }
  summary.topNegativeReasons = Object.entries(negReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));
  return summary;
}

function parseFeedbackDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(90, Math.floor(n));
}

function feedbackReviewAllowlist() {
  return String(process.env.FEEDBACK_REVIEW_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function canReviewFeedback(user) {
  const allow = feedbackReviewAllowlist();
  if (!allow.length) return false;
  const email = String(user?.email || "").trim().toLowerCase();
  return Boolean(email && allow.includes(email));
}

app.get("/api/feedback-summary", requireSession, async (req, res) => {
  try {
    const days = parseFeedbackDays(req.query?.days);
    const sinceIso = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const admin = getSupabaseAdminClient();
    if (admin) {
      let q = admin.from("assistant_feedback").select("rating, reason, mode, study_mode").limit(50000);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q;
      if (!error && Array.isArray(data)) {
        return res.json(aggregateFeedbackRows(data, { source: "supabase", days }));
      }
      // eslint-disable-next-line no-console
      console.warn("[feedback-summary] Supabase read failed, falling back to file:", error?.message || error);
    }

    if (!fs.existsSync(feedbackLogPath)) {
      return res.json(
        aggregateFeedbackRows([], {
          source: "file",
          days,
        }),
      );
    }
    const raw = await fs.promises.readFile(feedbackLogPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const rows = [];
    for (const line of lines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (sinceIso) {
        const ts = String(row.receivedAt || row.createdAt || "");
        if (ts && ts < sinceIso) continue;
      }
      rows.push({
        rating: row.rating,
        reason: row.reason,
        mode: row.mode,
        studyMode: row.studyMode,
      });
    }
    return res.json(aggregateFeedbackRows(rows, { source: "file", days }));
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

/** Founder weekly review: recent negative thumbs (gated by FEEDBACK_REVIEW_EMAILS). */
app.get("/api/feedback-review", requireSession, async (req, res) => {
  try {
    if (!canReviewFeedback(req.user)) {
      return res.status(403).json({
        error: "Feedback review is limited to allowlisted founder emails. Set FEEDBACK_REVIEW_EMAILS on the server.",
      });
    }
    const days = parseFeedbackDays(req.query?.days) || 7;
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 40));
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("assistant_feedback")
        .select("id, rating, reason, mode, study_mode, assistant_message, created_at")
        .eq("rating", -1)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && Array.isArray(data)) {
        const summaryQ = await admin
          .from("assistant_feedback")
          .select("rating, reason, mode, study_mode")
          .gte("created_at", sinceIso)
          .limit(50000);
        const summary =
          !summaryQ.error && Array.isArray(summaryQ.data)
            ? aggregateFeedbackRows(summaryQ.data, { source: "supabase", days })
            : null;
        return res.json({
          ok: true,
          days,
          summary,
          negatives: data.map((row) => ({
            id: row.id,
            reason: row.reason,
            mode: row.mode,
            studyMode: row.study_mode,
            createdAt: row.created_at,
            assistantPreview: String(row.assistant_message || "").slice(0, 400),
          })),
        });
      }
      // eslint-disable-next-line no-console
      console.warn("[feedback-review] Supabase read failed:", error?.message || error);
    }
    return res.status(503).json({
      error:
        "Supabase feedback table not available. Set SUPABASE_SERVICE_ROLE_KEY and run supabase/assistant_feedback.sql.",
    });
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
    liveWebConfigured: LIVE_WEB_CONFIGURED,
    supabaseUrlConfigured: Boolean(SUPABASE_URL),
    supabaseAnonConfigured: Boolean(SUPABASE_ANON_KEY),
    /** Needed to write thumbs feedback into public.assistant_feedback (never expose this key to the browser). */
    feedbackSupabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
    /** Founder weekly review endpoint allowlist configured. */
    feedbackReviewAllowlistConfigured: feedbackReviewAllowlist().length > 0,
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
