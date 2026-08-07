/**
 * Opt-in Google Workspace connectors (Calendar, Drive, Gmail).
 * Tokens are encrypted at rest; never returned to the browser.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

const MAX_CONTEXT_CHARS = 6000;
const STATE_TTL_MS = 15 * 60 * 1000;

function normalizeEnvString(s) {
  let t = String(s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\uFF1A/g, ":").replace(/\u2013|\u2014/g, "-");
}

function createGoogleWorkspace({
  clientId,
  clientSecret,
  redirectUri,
  encryptionKey,
  getSupabaseAdmin,
  dataDir,
}) {
  const GOOGLE_CLIENT_ID = normalizeEnvString(clientId);
  const GOOGLE_CLIENT_SECRET = normalizeEnvString(clientSecret);
  const GOOGLE_REDIRECT_URI = normalizeEnvString(redirectUri);
  const ENC_SECRET = normalizeEnvString(encryptionKey) || GOOGLE_CLIENT_SECRET || "dev-only-change-me";
  const fileStorePath = path.join(dataDir || path.join(__dirname, "..", "data"), "google-workspace.json");

  const configured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);

  function encKey() {
    return crypto.createHash("sha256").update(ENC_SECRET).digest();
  }

  function encryptJson(obj) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
    const plain = Buffer.from(JSON.stringify(obj), "utf8");
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
  }

  function decryptJson(payload) {
    const parts = String(payload || "").split(".");
    if (parts.length !== 3) throw new Error("Invalid token payload");
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(dec.toString("utf8"));
  }

  function signState(userId) {
    const body = {
      uid: userId,
      exp: Date.now() + STATE_TTL_MS,
      n: crypto.randomBytes(8).toString("hex"),
    };
    const raw = Buffer.from(JSON.stringify(body)).toString("base64url");
    const sig = crypto.createHmac("sha256", ENC_SECRET).update(raw).digest("base64url");
    return `${raw}.${sig}`;
  }

  function verifyState(state) {
    const [raw, sig] = String(state || "").split(".");
    if (!raw || !sig) return null;
    const expect = crypto.createHmac("sha256", ENC_SECRET).update(raw).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    let body;
    try {
      body = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (!body?.uid || !body?.exp || Date.now() > body.exp) return null;
    return String(body.uid);
  }

  function ensureDataDir() {
    const dir = path.dirname(fileStorePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function readFileStore() {
    try {
      ensureDataDir();
      if (!fs.existsSync(fileStorePath)) return {};
      return JSON.parse(fs.readFileSync(fileStorePath, "utf8") || "{}");
    } catch {
      return {};
    }
  }

  function writeFileStore(all) {
    ensureDataDir();
    fs.writeFileSync(fileStorePath, JSON.stringify(all, null, 2), "utf8");
  }

  async function saveConnection(userId, record) {
    const admin = typeof getSupabaseAdmin === "function" ? getSupabaseAdmin() : null;
    const row = {
      user_id: userId,
      email: record.email || null,
      token_blob: encryptJson({
        access_token: record.access_token,
        refresh_token: record.refresh_token,
        expiry_date: record.expiry_date || 0,
      }),
      scopes: SCOPES,
      include_calendar: record.include_calendar !== false,
      include_drive: record.include_drive !== false,
      include_gmail: record.include_gmail !== false,
      snapshot_text: record.snapshot_text || "",
      snapshot_meta: record.snapshot_meta || {},
      last_sync_at: record.last_sync_at || null,
      updated_at: new Date().toISOString(),
    };

    if (admin) {
      const { error } = await admin.from("google_workspace_connections").upsert(row, { onConflict: "user_id" });
      if (!error) return { stored: "supabase" };
      // fall through to file if table missing
    }

    const all = readFileStore();
    all[userId] = { ...row, created_at: all[userId]?.created_at || new Date().toISOString() };
    writeFileStore(all);
    return { stored: "file" };
  }

  async function loadConnection(userId) {
    const admin = typeof getSupabaseAdmin === "function" ? getSupabaseAdmin() : null;
    if (admin) {
      const { data, error } = await admin
        .from("google_workspace_connections")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (!error && data) return data;
    }
    return readFileStore()[userId] || null;
  }

  async function deleteConnection(userId) {
    const admin = typeof getSupabaseAdmin === "function" ? getSupabaseAdmin() : null;
    if (admin) {
      await admin.from("google_workspace_connections").delete().eq("user_id", userId);
    }
    const all = readFileStore();
    if (all[userId]) {
      delete all[userId];
      writeFileStore(all);
    }
  }

  function buildAuthUrl(userId) {
    if (!configured) {
      const err = new Error("Google Workspace is not configured on the server.");
      err.code = "not_configured";
      throw err;
    }
    const state = signState(userId);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async function exchangeCode(code) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error_description || data.error || "Google token exchange failed");
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || "",
      expiry_date: Date.now() + Number(data.expires_in || 3600) * 1000,
      scope: data.scope || SCOPES,
    };
  }

  async function refreshAccessToken(refreshToken) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error_description || data.error || "Google token refresh failed");
    }
    return {
      access_token: data.access_token,
      expiry_date: Date.now() + Number(data.expires_in || 3600) * 1000,
    };
  }

  async function fetchGoogleJson(url, accessToken) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || data.error_description || data.error || `Google API ${res.status}`;
      const err = new Error(typeof msg === "string" ? msg : "Google API error");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function getValidTokens(userId) {
    const row = await loadConnection(userId);
    if (!row?.token_blob) return null;
    let tokens;
    try {
      tokens = decryptJson(row.token_blob);
    } catch {
      return null;
    }
    if (!tokens.access_token && !tokens.refresh_token) return null;

    if (tokens.expiry_date && Date.now() < tokens.expiry_date - 60_000) {
      return { row, tokens };
    }
    if (!tokens.refresh_token) return { row, tokens };

    const refreshed = await refreshAccessToken(tokens.refresh_token);
    tokens.access_token = refreshed.access_token;
    tokens.expiry_date = refreshed.expiry_date;
    await saveConnection(userId, {
      email: row.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      include_calendar: row.include_calendar !== false,
      include_drive: row.include_drive !== false,
      include_gmail: row.include_gmail !== false,
      snapshot_text: row.snapshot_text || "",
      snapshot_meta: row.snapshot_meta || {},
      last_sync_at: row.last_sync_at || null,
    });
    return { row: await loadConnection(userId), tokens };
  }

  async function fetchUserEmail(accessToken) {
    try {
      const data = await fetchGoogleJson("https://www.googleapis.com/oauth2/v2/userinfo", accessToken);
      return String(data.email || "").trim();
    } catch {
      return "";
    }
  }

  async function syncCalendar(accessToken) {
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "12",
    });
    const data = await fetchGoogleJson(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      accessToken,
    );
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((ev) => {
      const start = ev.start?.dateTime || ev.start?.date || "";
      const title = ev.summary || "(no title)";
      return `- ${start}: ${title}`;
    });
  }

  async function syncDrive(accessToken) {
    const params = new URLSearchParams({
      pageSize: "10",
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
      q: "trashed=false",
    });
    const data = await fetchGoogleJson(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      accessToken,
    );
    const files = Array.isArray(data.files) ? data.files : [];
    const lines = [];
    for (const f of files) {
      lines.push(`- ${f.name} (${f.mimeType || "file"}; modified ${f.modifiedTime || "?"})`);
      if (f.mimeType === "application/vnd.google-apps.document" && f.id) {
        try {
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}/export?mimeType=text/plain`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (res.ok) {
            const text = (await res.text()).replace(/\s+/g, " ").trim().slice(0, 400);
            if (text) lines.push(`  excerpt: ${text}`);
          }
        } catch {
          /* ignore export failures */
        }
      }
    }
    return lines;
  }

  async function syncGmail(accessToken) {
    const list = await fetchGoogleJson(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&labelIds=INBOX",
      accessToken,
    );
    const messages = Array.isArray(list.messages) ? list.messages : [];
    const lines = [];
    for (const m of messages) {
      if (!m?.id) continue;
      const full = await fetchGoogleJson(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          m.id,
        )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        accessToken,
      );
      const headers = Array.isArray(full.payload?.headers) ? full.payload.headers : [];
      const getH = (name) =>
        headers.find((h) => String(h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
      const subject = getH("Subject") || "(no subject)";
      const from = getH("From") || "";
      const date = getH("Date") || "";
      const snippet = String(full.snippet || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
      lines.push(`- ${date} | ${from} | ${subject}`);
      if (snippet) lines.push(`  snippet: ${snippet}`);
    }
    return lines;
  }

  async function syncUser(userId, overrides = {}) {
    const packed = await getValidTokens(userId);
    if (!packed) {
      const err = new Error("Google Workspace is not connected.");
      err.code = "not_connected";
      throw err;
    }
    const { row, tokens } = packed;
    const includeCalendar =
      overrides.include_calendar != null ? overrides.include_calendar : row.include_calendar !== false;
    const includeDrive =
      overrides.include_drive != null ? overrides.include_drive : row.include_drive !== false;
    const includeGmail =
      overrides.include_gmail != null ? overrides.include_gmail : row.include_gmail !== false;

    const sections = [];
    const meta = { calendar: 0, drive: 0, gmail: 0, errors: [] };

    if (includeCalendar) {
      try {
        const lines = await syncCalendar(tokens.access_token);
        meta.calendar = lines.length;
        if (lines.length) sections.push("Calendar (next 14 days):\n" + lines.join("\n"));
      } catch (e) {
        meta.errors.push(`calendar: ${e.message || e}`);
      }
    }
    if (includeDrive) {
      try {
        const lines = await syncDrive(tokens.access_token);
        meta.drive = lines.length;
        if (lines.length) sections.push("Drive (recent files):\n" + lines.join("\n"));
      } catch (e) {
        meta.errors.push(`drive: ${e.message || e}`);
      }
    }
    if (includeGmail) {
      try {
        const lines = await syncGmail(tokens.access_token);
        meta.gmail = lines.length;
        if (lines.length) sections.push("Gmail (recent inbox):\n" + lines.join("\n"));
      } catch (e) {
        meta.errors.push(`gmail: ${e.message || e}`);
      }
    }

    const snapshot_text = sections.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
    const last_sync_at = new Date().toISOString();
    await saveConnection(userId, {
      email: row.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      include_calendar: includeCalendar,
      include_drive: includeDrive,
      include_gmail: includeGmail,
      snapshot_text,
      snapshot_meta: meta,
      last_sync_at,
    });

    return {
      snapshot_text,
      snapshot_meta: meta,
      last_sync_at,
      include_calendar: includeCalendar,
      include_drive: includeDrive,
      include_gmail: includeGmail,
    };
  }

  function buildWorkspaceSystemAppendix(snapshotText) {
    const text = String(snapshotText || "").trim().slice(0, MAX_CONTEXT_CHARS);
    if (!text) {
      return [
        "Google Workspace was requested, but no synced calendar/drive/gmail snapshot is available yet.",
        "Ask the student to open Google Workspace settings and Sync, or answer without personal workspace context.",
      ].join(" ");
    }
    return [
      "The student opted in to use their Google Workspace snapshot below (Calendar, Drive, and/or Gmail).",
      "Use it only when relevant. Do not invent extra personal facts. Prefer the student's question if it conflicts.",
      "Do not dump raw email or file contents unless needed to help. Keep the calm study-coach tone.",
      "",
      "--- GOOGLE WORKSPACE SNAPSHOT ---",
      text,
      "--- END GOOGLE WORKSPACE SNAPSHOT ---",
    ].join("\n");
  }

  async function getStatus(userId) {
    const row = await loadConnection(userId);
    if (!row) {
      return {
        configured,
        connected: false,
        email: null,
        include_calendar: true,
        include_drive: true,
        include_gmail: true,
        last_sync_at: null,
        snapshot_meta: null,
        has_snapshot: false,
      };
    }
    return {
      configured,
      connected: true,
      email: row.email || null,
      include_calendar: row.include_calendar !== false,
      include_drive: row.include_drive !== false,
      include_gmail: row.include_gmail !== false,
      last_sync_at: row.last_sync_at || null,
      snapshot_meta: row.snapshot_meta || null,
      has_snapshot: Boolean(String(row.snapshot_text || "").trim()),
    };
  }

  async function getSnapshotForAsk(userId) {
    const row = await loadConnection(userId);
    if (!row) return "";
    return String(row.snapshot_text || "").trim().slice(0, MAX_CONTEXT_CHARS);
  }

  async function handleOAuthCallback(code, state) {
    const userId = verifyState(state);
    if (!userId) {
      const err = new Error("Invalid or expired OAuth state. Try Connect again.");
      err.code = "bad_state";
      throw err;
    }
    const tokens = await exchangeCode(code);
    const email = await fetchUserEmail(tokens.access_token);
    const existing = await loadConnection(userId);
    let priorRefresh = "";
    if (existing?.token_blob) {
      try {
        priorRefresh = decryptJson(existing.token_blob).refresh_token || "";
      } catch {
        priorRefresh = "";
      }
    }
    await saveConnection(userId, {
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || priorRefresh || "",
      expiry_date: tokens.expiry_date,
      include_calendar: existing?.include_calendar !== false,
      include_drive: existing?.include_drive !== false,
      include_gmail: existing?.include_gmail !== false,
      snapshot_text: existing?.snapshot_text || "",
      snapshot_meta: existing?.snapshot_meta || {},
      last_sync_at: existing?.last_sync_at || null,
    });
    // Auto-sync once after connect
    try {
      await syncUser(userId);
    } catch {
      /* connect still succeeds; user can Sync later */
    }
    return { userId, email };
  }

  async function updateIncludes(userId, includes) {
    const packed = await getValidTokens(userId);
    if (!packed) {
      const err = new Error("Google Workspace is not connected.");
      err.code = "not_connected";
      throw err;
    }
    const { row, tokens } = packed;
    await saveConnection(userId, {
      email: row.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      include_calendar: includes.include_calendar !== false,
      include_drive: includes.include_drive !== false,
      include_gmail: includes.include_gmail !== false,
      snapshot_text: row.snapshot_text || "",
      snapshot_meta: row.snapshot_meta || {},
      last_sync_at: row.last_sync_at || null,
    });
    return getStatus(userId);
  }

  async function revokeIfPossible(userId) {
    try {
      const packed = await getValidTokens(userId);
      if (packed?.tokens?.access_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(packed.tokens.access_token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      }
    } catch {
      /* ignore revoke errors */
    }
    await deleteConnection(userId);
  }

  return {
    configured,
    scopes: SCOPES,
    buildAuthUrl,
    handleOAuthCallback,
    getStatus,
    syncUser,
    updateIncludes,
    revokeIfPossible,
    getSnapshotForAsk,
    buildWorkspaceSystemAppendix,
  };
}

module.exports = { createGoogleWorkspace, SCOPES };
