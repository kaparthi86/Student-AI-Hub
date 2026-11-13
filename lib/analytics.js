/**
 * Student Intelligence — server-side analytics helpers.
 * Writes via Supabase service_role only. Sanitizes properties (no PII / transcripts).
 */

const ALLOWED_EVENTS = new Set([
  "login_completed",
  "logout",
  "dashboard_viewed",
  "ai_coach_opened",
  "question_submitted",
  "voice_session_started",
  "voice_session_ended",
  "notebook_uploaded",
  "notebook_analyzed",
  "quiz_completed",
  "practice_started",
  "practice_completed",
  "study_plan_created",
  "study_plan_item_completed",
  "knowledge_gap_detected",
  "diagnostic_completed",
  "exam_mock_completed",
  "flashcards_reviewed",
  "focus_session_completed",
  "onboarding_completed",
  "onboarding_skipped",
  "profile_updated",
  "progress_viewed",
  "planner_viewed",
  "exam_viewed",
  "tab_opened",
  "session_started",
  "session_ended",
  "consent_updated",
  "support_submitted",
  "feedback_submitted",
]);

const ALLOWED_FEATURES = new Set([
  "home",
  "coach",
  "ask",
  "code",
  "notebook",
  "voice",
  "flashcards",
  "math",
  "focus",
  "gaps",
  "planner",
  "exam",
  "diagnostic",
  "progress",
  "profile",
  "onboarding",
  "support",
  "auth",
  "practice",
  "journey",
]);

const BLOCKED_PROP_KEYS = new Set([
  "email",
  "name",
  "full_name",
  "fullname",
  "phone",
  "address",
  "message",
  "content",
  "prompt",
  "answer",
  "transcript",
  "document",
  "documentcontext",
  "assistantmessage",
  "raw",
  "password",
  "token",
]);

function normalizeEnvString(s) {
  let t = String(s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t.replace(/\uFF1A/g, ":").replace(/\u2013|\u2014/g, "-");
}

function analyticsAdminAllowlist() {
  const primary = String(process.env.ANALYTICS_ADMIN_EMAILS || "").trim();
  const fallback = String(process.env.FEEDBACK_REVIEW_EMAILS || "").trim();
  return (primary || fallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function canAccessAnalyticsAdmin(user) {
  const allow = analyticsAdminAllowlist();
  if (!allow.length) return false;
  const email = String(user?.email || "").trim().toLowerCase();
  return Boolean(email && allow.includes(email));
}

function sanitizeProperties(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k || "").trim().slice(0, 40);
    if (!key) continue;
    if (BLOCKED_PROP_KEYS.has(key.toLowerCase().replace(/[^a-z0-9_]/g, ""))) continue;
    if (v == null) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = Math.round(v * 1000) / 1000;
      continue;
    }
    if (typeof v === "boolean") {
      out[key] = v;
      continue;
    }
    if (typeof v === "string") {
      out[key] = v.slice(0, 120);
      continue;
    }
    if (Array.isArray(v)) {
      out[key] = v
        .slice(0, 8)
        .map((x) => (typeof x === "string" ? x.slice(0, 64) : typeof x === "number" ? x : null))
        .filter((x) => x != null);
    }
  }
  return out;
}

function normalizeEventName(name) {
  const n = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 64);
  return ALLOWED_EVENTS.has(n) ? n : null;
}

function normalizeFeature(feature) {
  const f = String(feature || "")
    .trim()
    .toLowerCase()
    .slice(0, 32);
  if (!f) return null;
  return ALLOWED_FEATURES.has(f) ? f : f.slice(0, 32);
}

function deviceCategoryFromUa(ua) {
  const s = String(ua || "").toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|iphone|android/.test(s)) return "mobile";
  if (!s) return "unknown";
  return "desktop";
}

function hashUserAgent(ua) {
  const crypto = require("crypto");
  const s = String(ua || "").slice(0, 300);
  if (!s) return null;
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null} admin
 */
async function getUserConsent(admin, userId) {
  if (!admin || !userId) {
    return { analytics_enabled: true, learning_analytics_enabled: true, personalization_enabled: true };
  }
  const { data, error } = await admin
    .from("user_consents")
    .select("analytics_enabled, learning_analytics_enabled, personalization_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    return { analytics_enabled: true, learning_analytics_enabled: true, personalization_enabled: true };
  }
  return data;
}

async function upsertConsent(admin, userId, patch = {}) {
  if (!admin || !userId) return { ok: false, error: "not_configured" };
  const row = {
    user_id: userId,
    analytics_enabled: patch.analytics_enabled !== false,
    learning_analytics_enabled: patch.learning_analytics_enabled !== false,
    personalization_enabled: patch.personalization_enabled !== false,
    consent_version: String(patch.consent_version || "v1").slice(0, 16),
    consented_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("user_consents").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function upsertStudentProfile(admin, userId, profile = {}, accountCreatedAt = null) {
  if (!admin || !userId) return { ok: false, error: "not_configured" };
  const row = {
    user_id: userId,
    grade_level: String(profile.gradeLevel || profile.grade_level || "").slice(0, 32) || null,
    subjects: String(profile.subjects || "").slice(0, 160) || null,
    learning_goal: String(profile.learningGoal || profile.learning_goal || "").slice(0, 40) || null,
    exam_focus: String(profile.examFocus || profile.exam_focus || "").slice(0, 32) || null,
    explain_style: String(profile.explainStyle || profile.explain_style || "").slice(0, 32) || null,
    reply_language: String(profile.replyLanguage || profile.reply_language || "").slice(0, 8) || null,
    country: String(profile.country || "").slice(0, 8) || null,
    region: String(profile.region || "").slice(0, 40) || null,
    board: String(profile.board || "").slice(0, 16) || null,
    last_active_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    profile_json: {
      source: "app",
      syncedAt: new Date().toISOString(),
    },
  };
  if (accountCreatedAt) row.account_created_at = accountCreatedAt;

  const { error } = await admin.from("student_profiles").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function touchLastActive(admin, userId) {
  if (!admin || !userId) return;
  await admin
    .from("student_profiles")
    .upsert(
      {
        user_id: userId,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}

async function startUserSession(admin, { userId, clientSessionId, platform, userAgent }) {
  if (!admin || !userId) return { ok: false, sessionId: null };
  const row = {
    user_id: userId,
    client_session_id: String(clientSessionId || "").slice(0, 64) || null,
    device_category: deviceCategoryFromUa(userAgent),
    platform: String(platform || "web").slice(0, 16),
    user_agent_hash: hashUserAgent(userAgent),
    started_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("user_sessions").insert(row).select("id").maybeSingle();
  if (error) return { ok: false, sessionId: null, error: error.message };
  return { ok: true, sessionId: data?.id || null };
}

async function endUserSession(admin, { userId, sessionId, clientSessionId }) {
  if (!admin || !userId) return { ok: false };
  let q = admin
    .from("user_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("ended_at", null);
  if (sessionId) q = q.eq("id", sessionId);
  else if (clientSessionId) q = q.eq("client_session_id", String(clientSessionId).slice(0, 64));
  const { error } = await q;
  return { ok: !error, error: error?.message };
}

async function insertEvents(admin, userId, events, { sessionId = null, platform = "web", consent } = {}) {
  if (!admin) return { ok: false, inserted: 0, error: "not_configured" };
  if (consent && consent.analytics_enabled === false) {
    return { ok: true, inserted: 0, skipped: "consent_opt_out" };
  }
  const rows = [];
  for (const raw of Array.isArray(events) ? events.slice(0, 40) : []) {
    const eventName = normalizeEventName(raw?.event_name || raw?.eventName || raw?.name);
    if (!eventName) continue;
    rows.push({
      user_id: userId || null,
      session_id: sessionId || null,
      event_name: eventName,
      feature: normalizeFeature(raw?.feature),
      properties: sanitizeProperties(raw?.properties),
      platform: String(raw?.platform || platform || "web").slice(0, 16),
      client_created_at: raw?.created_at || raw?.client_created_at || null,
    });
  }
  if (!rows.length) return { ok: true, inserted: 0 };
  const { error } = await admin.from("analytics_events").insert(rows);
  if (error) return { ok: false, inserted: 0, error: error.message };
  if (userId) void touchLastActive(admin, userId);
  return { ok: true, inserted: rows.length };
}

async function recordLearningActivity(admin, userId, activity = {}) {
  if (!admin || !userId) return { ok: false, error: "not_configured" };
  const row = {
    user_id: userId,
    activity_type: String(activity.activity_type || activity.type || "study").slice(0, 40),
    feature: normalizeFeature(activity.feature),
    subject: String(activity.subject || "").slice(0, 80) || null,
    topic: String(activity.topic || "").slice(0, 80) || null,
    questions_count: Number.isFinite(Number(activity.questions_count))
      ? Math.max(0, Math.min(100, Number(activity.questions_count)))
      : null,
    correct_count: Number.isFinite(Number(activity.correct_count))
      ? Math.max(0, Math.min(100, Number(activity.correct_count)))
      : null,
    duration_seconds: Number.isFinite(Number(activity.duration_seconds))
      ? Math.max(0, Math.min(86400, Number(activity.duration_seconds)))
      : null,
    score_pct: Number.isFinite(Number(activity.score_pct))
      ? Math.max(0, Math.min(100, Number(activity.score_pct)))
      : null,
    meta: sanitizeProperties(activity.meta || {}),
  };
  const { error } = await admin.from("learning_activity").insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function upsertLearningProgress(admin, userId, items = []) {
  if (!admin || !userId) return { ok: false, error: "not_configured" };
  const list = Array.isArray(items) ? items.slice(0, 40) : [];
  if (!list.length) return { ok: true, upserted: 0 };
  const rows = list
    .map((it) => {
      const subject = String(it.subject || it.topic || "").trim().slice(0, 80);
      if (!subject) return null;
      const topic = String(it.topic || subject).trim().slice(0, 80);
      const mastery = Number(it.mastery_pct ?? it.mastery);
      const accuracy = Number(it.accuracy_pct ?? it.accuracy);
      return {
        user_id: userId,
        subject,
        topic,
        mastery_pct: Number.isFinite(mastery) ? Math.max(0, Math.min(100, mastery)) : null,
        accuracy_pct: Number.isFinite(accuracy) ? Math.max(0, Math.min(100, accuracy)) : null,
        knowledge_gap: Boolean(it.knowledge_gap || (Number.isFinite(mastery) && mastery < 60)),
        attempts: Math.max(0, Number(it.attempts) || 0),
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        meta: sanitizeProperties(it.meta || {}),
      };
    })
    .filter(Boolean);
  if (!rows.length) return { ok: true, upserted: 0 };
  const { error } = await admin.from("learning_progress").upsert(rows, {
    onConflict: "user_id,subject,topic",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, upserted: rows.length };
}

async function buildAdminDashboard(admin, { days = 7 } = {}) {
  if (!admin) return { ok: false, error: "Supabase admin not configured" };
  const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profilesCount,
    eventsRecent,
    sessionsRecent,
    activityRecent,
    progressGaps,
    consents,
  ] = await Promise.all([
    admin.from("student_profiles").select("user_id", { count: "exact", head: true }),
    admin
      .from("analytics_events")
      .select("event_name, feature, user_id, created_at")
      .gte("created_at", since)
      .limit(20000),
    admin
      .from("user_sessions")
      .select("user_id, started_at, ended_at")
      .gte("started_at", since)
      .limit(10000),
    admin
      .from("learning_activity")
      .select("activity_type, feature, subject, score_pct, created_at")
      .gte("created_at", since)
      .limit(10000),
    admin
      .from("learning_progress")
      .select("subject, topic, mastery_pct, knowledge_gap")
      .eq("knowledge_gap", true)
      .limit(500),
    admin.from("user_consents").select("analytics_enabled").limit(5000),
  ]);

  const events = Array.isArray(eventsRecent.data) ? eventsRecent.data : [];
  const sessions = Array.isArray(sessionsRecent.data) ? sessionsRecent.data : [];
  const activities = Array.isArray(activityRecent.data) ? activityRecent.data : [];

  const uniqueUsers = new Set(events.map((e) => e.user_id).filter(Boolean));
  const weeklyActive = uniqueUsers.size;

  const featureUsers = {};
  const eventCounts = {};
  for (const e of events) {
    const key = e.feature || e.event_name || "other";
    eventCounts[e.event_name] = (eventCounts[e.event_name] || 0) + 1;
    if (!featureUsers[key]) featureUsers[key] = new Set();
    if (e.user_id) featureUsers[key].add(e.user_id);
  }

  const featureAdoption = Object.entries(featureUsers)
    .map(([feature, set]) => ({
      feature,
      uniqueUsers: set.size,
      pctOfActive: weeklyActive ? Math.round((set.size / weeklyActive) * 100) : 0,
    }))
    .sort((a, b) => b.uniqueUsers - a.uniqueUsers)
    .slice(0, 12);

  const onboardingDone = eventCounts.onboarding_completed || 0;
  const onboardingSkip = eventCounts.onboarding_skipped || 0;
  const onboardingTotal = onboardingDone + onboardingSkip;
  const onboardingCompletion = onboardingTotal
    ? Math.round((onboardingDone / onboardingTotal) * 100)
    : null;

  // Rough 7-day retention: users with events on day0 cohort who also appear later — simplified
  const dayBuckets = {};
  for (const e of events) {
    if (!e.user_id || !e.created_at) continue;
    const day = String(e.created_at).slice(0, 10);
    if (!dayBuckets[day]) dayBuckets[day] = new Set();
    dayBuckets[day].add(e.user_id);
  }
  const daysSorted = Object.keys(dayBuckets).sort();
  let retention7 = null;
  if (daysSorted.length >= 2) {
    const first = dayBuckets[daysSorted[0]];
    const later = new Set();
    for (const d of daysSorted.slice(1)) {
      for (const u of dayBuckets[d]) later.add(u);
    }
    const retained = [...first].filter((u) => later.has(u)).length;
    retention7 = first.size ? Math.round((retained / first.size) * 100) : null;
  }

  const quizScores = activities
    .map((a) => Number(a.score_pct))
    .filter((n) => Number.isFinite(n));
  const avgQuizAccuracy = quizScores.length
    ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)
    : null;

  const subjectCounts = {};
  for (const a of activities) {
    const s = a.subject || "General";
    subjectCounts[s] = (subjectCounts[s] || 0) + 1;
  }
  const topSubjects = Object.entries(subjectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([subject, count]) => ({ subject, count }));

  const challenging = (Array.isArray(progressGaps.data) ? progressGaps.data : [])
    .slice(0, 12)
    .map((r) => ({
      subject: r.subject,
      topic: r.topic,
      mastery_pct: r.mastery_pct,
    }));

  const consentRows = Array.isArray(consents.data) ? consents.data : [];
  const analyticsOptIn = consentRows.filter((c) => c.analytics_enabled !== false).length;

  // registered approx from profiles; auth.users may not be readable via client
  const registered = profilesCount.count ?? null;

  return {
    ok: true,
    days,
    generatedAt: new Date().toISOString(),
    kpis: {
      registeredStudents: registered,
      weeklyActiveStudents: weeklyActive,
      sessions: sessions.length,
      events: events.length,
      onboardingCompletionPct: onboardingCompletion,
      retention7Pct: retention7,
      avgQuizAccuracyPct: avgQuizAccuracy,
      analyticsOptInCount: analyticsOptIn,
    },
    featureAdoption,
    topEvents: Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([event_name, count]) => ({ event_name, count })),
    topSubjects,
    challengingTopics: challenging,
    learningActivityCount: activities.length,
    since,
    since30Hint: since30,
  };
}

module.exports = {
  ALLOWED_EVENTS,
  analyticsAdminAllowlist,
  canAccessAnalyticsAdmin,
  sanitizeProperties,
  normalizeEventName,
  getUserConsent,
  upsertConsent,
  upsertStudentProfile,
  startUserSession,
  endUserSession,
  insertEvents,
  recordLearningActivity,
  upsertLearningProgress,
  buildAdminDashboard,
  deviceCategoryFromUa,
  normalizeEnvString,
};
