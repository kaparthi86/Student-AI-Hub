const express = require("express");
const cors = require("cors");
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
/** OpenAI-compatible chat completions endpoint (Inference Providers / Router). */
const HF_CHAT_URL =
  normalizeEnvString(process.env.HF_CHAT_URL) || "https://router.huggingface.co/v1/chat/completions";
const envFileExists = fs.existsSync(envPath);

const MAX_DOC_CHARS = 45000;
const MAX_CHAT_HISTORY = 24;

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

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

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
    const msg = parsed?.error?.message || parsed?.message;
    const code = parsed?.error?.code || parsed?.code;
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
    "Unsupported file type. Use .txt, .md, .csv, .json, or .pdf for this MVP."
  );
}

function truncateForPrompt(text, maxChars) {
  const t = String(text || "");
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[Document truncated for length.]`;
}

function notebookInsightsPrompt(docName, docText) {
  const body = truncateForPrompt(docText, MAX_DOC_CHARS);
  return `You are "Study Notebook", similar to a notebook-style study assistant.

Student uploaded a document named "${docName}".

Using ONLY the document content below, produce structured study notes for students:
1) Executive summary (5-8 bullets)
2) Key concepts and definitions (bullet list)
3) Important formulas / steps / algorithms (if any; else say "None obvious")
4) 8 quiz questions with answers (mix easy/medium)
5) A 7-day study plan (short daily tasks)

Rules:
- If information is missing, say "Not in document" instead of guessing.
- Use clear Markdown headings (##) for each section.

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

  const response = await fetch(chatEndpoint.href, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: HF_MODEL,
      messages,
      temperature,
      max_tokens,
      stream: false,
    }),
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
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (data?.error)
    return `Hugging Face error: ${typeof data.error === "string" ? data.error : JSON.stringify(data.error)}`;
  return `Unexpected model response: ${JSON.stringify(data).slice(0, 800)}`;
}

async function queryModelSingle(mode, userInput) {
  const prompt = buildPrompt(mode, userInput);
  return callChatCompletion(
    [
      {
        role: "system",
        content:
          "You help students learn. Be concise, accurate, and encouraging. If asked for code, include short examples.",
      },
      { role: "user", content: prompt },
    ],
    { max_tokens: 500, temperature: 0.6 }
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

function chatSystemBase(mode) {
  return mode === "code"
    ? "You are a patient coding tutor for students. Keep answers concise. Use Markdown code fences for code."
    : "You are a friendly study coach for students. Keep answers concise and actionable. Use Markdown when helpful.";
}

app.post("/api/ai", async (req, res) => {
  try {
    const mode = req.body?.mode === "code" ? "code" : "learn";
    const input = String(req.body?.input || "").trim().slice(0, 2000);
    if (!input) return res.status(400).json({ error: "Input is required." });

    const output = await queryModelSingle(mode, input);
    return res.json({ output });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const mode = req.body?.mode === "code" ? "code" : "learn";
    const lastMessage = String(req.body?.message || "").trim().slice(0, 4000);
    if (!lastMessage) return res.status(400).json({ error: "message is required." });

    const history = normalizeChatMessages(req.body?.history);
    const messages = [{ role: "system", content: chatSystemBase(mode) }, ...history, { role: "user", content: lastMessage }];

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

      const hfRes = await fetch(chatEndpoint.href, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HF_MODEL,
          messages,
          temperature: 0.55,
          max_tokens: 720,
          stream: true,
        }),
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

    const output = await callChatCompletion(messages, { max_tokens: 720, temperature: 0.55 });
    return res.json({ output });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.post("/api/doc-insights", upload.single("document"), async (req, res) => {
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
    const prompt = notebookInsightsPrompt(name, text);

    const output = await callChatCompletion(
      [
        {
          role: "system",
          content:
            "You create accurate student study materials. Never invent facts not present in the document. Prefer Markdown.",
        },
        { role: "user", content: prompt },
      ],
      { max_tokens: 1400, temperature: 0.35 }
    );

    return res.json({ output, docName: name, charsUsed: Math.min(text.length, MAX_DOC_CHARS) });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error" });
  }
});

app.get("/api/health", (_req, res) => {
  const indexHtmlDeployed = fs.existsSync(indexHtmlPath);
  res.json({
    ok: true,
    envFileExists,
    hfConfigured: Boolean(HF_API_TOKEN),
    hfModel: HF_MODEL,
    hfChatUrl: HF_CHAT_URL,
    betaTesting: BETA_TESTING,
    betaMessage: betaBannerText(),
    /** If false, Git/Render never received `public/` (root URL will 404). */
    indexHtmlDeployed,
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

app.listen(PORT, () => {
  const isProd = process.env.NODE_ENV === "production";
  // eslint-disable-next-line no-console
  console.log(`Student AI MVP listening on port ${PORT}`);
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
        ? "Hugging Face token missing ù set HF_API_TOKEN in Render (Environment) and redeploy."
        : "Hugging Face token missing ù add HF_API_TOKEN to .env next to server.js for real AI."
  );
});
