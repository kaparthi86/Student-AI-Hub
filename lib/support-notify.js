/**
 * Forward Help & Support form submissions to an inbox / Google Group.
 * The group address stays server-only — never shown in the UI.
 *
 * Configure one path:
 *   A) Resend: RESEND_API_KEY + SUPPORT_FROM_EMAIL + SUPPORT_NOTIFY_TO
 *   B) SMTP:   SMTP_HOST + SMTP_USER + SMTP_PASS + SUPPORT_FROM_EMAIL + SUPPORT_NOTIFY_TO
 */

function normalizeEnvString(s) {
  let t = String(s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\uFF1A/g, ":").replace(/\u2013|\u2014/g, "-");
}

const SUPPORT_NOTIFY_TO = normalizeEnvString(process.env.SUPPORT_NOTIFY_TO || "");
const SUPPORT_FROM_EMAIL = normalizeEnvString(process.env.SUPPORT_FROM_EMAIL || "");
const RESEND_API_KEY = normalizeEnvString(process.env.RESEND_API_KEY || "");
const SMTP_HOST = normalizeEnvString(process.env.SMTP_HOST || "");
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = normalizeEnvString(process.env.SMTP_USER || "");
const SMTP_PASS = normalizeEnvString(process.env.SMTP_PASS || "");
const SMTP_SECURE =
  String(process.env.SMTP_SECURE || "").trim() === "1" ||
  String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
  SMTP_PORT === 465;

function supportNotifyConfigured() {
  if (!SUPPORT_NOTIFY_TO || !SUPPORT_FROM_EMAIL) return false;
  if (RESEND_API_KEY) return true;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return true;
  return false;
}

/** Safe diagnostics for /api/health — never includes secrets or email addresses. */
function supportNotifyStatus() {
  const hasTo = Boolean(SUPPORT_NOTIFY_TO);
  const hasFrom = Boolean(SUPPORT_FROM_EMAIL);
  const hasResend = Boolean(RESEND_API_KEY);
  const hasSmtp = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
  const missing = [];
  if (!hasTo) missing.push("SUPPORT_NOTIFY_TO");
  if (!hasFrom) missing.push("SUPPORT_FROM_EMAIL");
  if (!hasResend && !hasSmtp) missing.push("RESEND_API_KEY_or_SMTP");
  return {
    configured: supportNotifyConfigured(),
    hasNotifyTo: hasTo,
    hasFromEmail: hasFrom,
    hasResend,
    hasSmtp,
    missing,
  };
}

function buildSupportEmail({ category, message, userEmail, userId, createdAt }) {
  const topic = String(category || "other").trim() || "other";
  const body = String(message || "").trim();
  const when = String(createdAt || new Date().toISOString());
  const who = userEmail || "(signed-in user, no email on session)";
  const uid = userId || "(unknown)";
  const subject = `[My Student Coach] Support: ${topic}`;
  const text = [
    "New Help & Support message from My Student Coach",
    "",
    `Topic: ${topic}`,
    `From: ${who}`,
    `User id: ${uid}`,
    `Submitted: ${when}`,
    "",
    "Message:",
    body,
    "",
    "—",
    "Sent by the in-app support form (address hidden from users).",
  ].join("\n");
  return { subject, text, replyTo: userEmail || undefined };
}

async function sendViaResend({ to, from, subject, text, replyTo }) {
  const payload = {
    from,
    to: [to],
    subject,
    text,
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = data?.message || raw.slice(0, 240) || res.statusText;
    throw new Error(`Resend failed (${res.status}): ${detail}`);
  }
  return { provider: "resend", id: data?.id || null };
}

async function sendViaSmtp({ to, from, subject, text, replyTo }) {
  // Lazy-require so installs without SMTP still boot if nodemailer is present.
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    throw new Error("nodemailer is not installed; use RESEND_API_KEY or npm install nodemailer");
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    replyTo: replyTo || undefined,
  });
  return { provider: "smtp", id: info?.messageId || null };
}

/**
 * Best-effort notify. Returns { ok, emailed, provider?, error? }.
 * Never throws — callers should still succeed if email fails.
 */
async function notifySupportInbox(payload) {
  if (!supportNotifyConfigured()) {
    return { ok: false, emailed: false, skipped: true };
  }
  const { subject, text, replyTo } = buildSupportEmail(payload);
  const mail = {
    to: SUPPORT_NOTIFY_TO,
    from: SUPPORT_FROM_EMAIL,
    subject,
    text,
    replyTo,
  };
  try {
    const result = RESEND_API_KEY ? await sendViaResend(mail) : await sendViaSmtp(mail);
    return { ok: true, emailed: true, provider: result.provider, id: result.id };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[support-notify]", err?.message || err);
    return { ok: false, emailed: false, error: String(err?.message || err).slice(0, 240) };
  }
}

module.exports = {
  supportNotifyConfigured,
  supportNotifyStatus,
  notifySupportInbox,
  SUPPORT_NOTIFY_TO,
};
