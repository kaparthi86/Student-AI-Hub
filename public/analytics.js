/**
 * Lightweight Student Intelligence event SDK.
 * Batches events to POST /api/analytics/events. No PII / transcripts in properties.
 */
(function initAnalytics() {
  const CONSENT_KEY = "student_ai_analytics_consent_v1";
  const CLIENT_SESSION_KEY = "student_ai_analytics_sid_v1";
  const queue = [];
  let flushTimer = null;
  let serverSessionId = null;
  let clientSessionId = null;
  let consent = { analytics_enabled: true, learning_analytics_enabled: true, personalization_enabled: true };
  let started = false;

  function api() {
    return window.StudentCoach || {};
  }

  function loadLocalConsent() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
      if (parsed && typeof parsed === "object") consent = { ...consent, ...parsed };
    } catch {
      /* ignore */
    }
  }

  function saveLocalConsent() {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      /* ignore */
    }
  }

  function ensureClientSession() {
    if (clientSessionId) return clientSessionId;
    try {
      clientSessionId = localStorage.getItem(CLIENT_SESSION_KEY);
      if (!clientSessionId) {
        clientSessionId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(CLIENT_SESSION_KEY, clientSessionId);
      }
    } catch {
      clientSessionId = `c_${Date.now().toString(36)}`;
    }
    return clientSessionId;
  }

  function track(eventName, feature, properties = {}) {
    if (!consent.analytics_enabled) return;
    const name = String(eventName || "").trim();
    if (!name) return;
    queue.push({
      event_name: name,
      feature: feature || null,
      properties: properties && typeof properties === "object" ? properties : {},
      platform: "web",
      created_at: new Date().toISOString(),
    });
    if (queue.length >= 12) flush();
    else scheduleFlush();
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flush(), 2500);
  }

  async function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!queue.length) return;
    if (!consent.analytics_enabled) {
      queue.length = 0;
      return;
    }
    const batch = queue.splice(0, 40);
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function") {
      queue.unshift(...batch);
      return;
    }
    try {
      await fetchAuthed("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: batch,
          sessionId: serverSessionId,
          platform: "web",
        }),
      });
    } catch {
      // Drop on failure — analytics must not block learning UX.
    }
  }

  async function syncProfile(profile) {
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function" || !profile) return;
    try {
      await fetchAuthed("/api/analytics/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
    } catch {
      /* ignore */
    }
  }

  async function syncConsent(next) {
    consent = { ...consent, ...next };
    saveLocalConsent();
    syncConsentForm();
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function") return;
    try {
      await fetchAuthed("/api/analytics/consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consent),
      });
    } catch {
      /* ignore */
    }
    track("consent_updated", "profile", {
      analytics_enabled: consent.analytics_enabled !== false,
    });
  }

  async function loadRemoteConsent() {
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function") return;
    try {
      const res = await fetchAuthed("/api/analytics/consent");
      const data = await res.json();
      if (data?.consent) {
        consent = { ...consent, ...data.consent };
        saveLocalConsent();
        syncConsentForm();
      }
    } catch {
      /* ignore */
    }
  }

  function syncConsentForm() {
    const a = document.getElementById("prefAnalyticsEnabled");
    const l = document.getElementById("prefLearningAnalyticsEnabled");
    const p = document.getElementById("prefPersonalizationEnabled");
    if (a) a.checked = consent.analytics_enabled !== false;
    if (l) l.checked = consent.learning_analytics_enabled !== false;
    if (p) p.checked = consent.personalization_enabled !== false;
  }

  async function startSession() {
    ensureClientSession();
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function") return;
    try {
      const res = await fetchAuthed("/api/analytics/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSessionId, platform: "web" }),
      });
      const data = await res.json();
      if (data?.sessionId) serverSessionId = data.sessionId;
    } catch {
      /* ignore */
    }
  }

  async function endSession() {
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function") return;
    try {
      await flush();
      await fetchAuthed("/api/analytics/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: serverSessionId, clientSessionId }),
      });
    } catch {
      /* ignore */
    }
  }

  async function recordLearning(activity, progress) {
    if (consent.learning_analytics_enabled === false) return;
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function") return;
    try {
      await fetchAuthed("/api/analytics/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity, progress }),
      });
    } catch {
      /* ignore */
    }
  }

  let cachedInsights = null;
  let insightsAt = 0;

  async function fetchInsights(force = false) {
    if (consent.personalization_enabled === false || consent.learning_analytics_enabled === false) {
      cachedInsights = {
        ok: true,
        gaps: [],
        strengths: [],
        recommendations: [],
        nudge: "Personalization is off in Privacy settings.",
        optedOut: true,
      };
      return cachedInsights;
    }
    if (!force && cachedInsights && Date.now() - insightsAt < 60_000) return cachedInsights;
    const fetchAuthed = api().fetchAuthed;
    if (typeof fetchAuthed !== "function") return cachedInsights;
    try {
      const res = await fetchAuthed("/api/analytics/insights");
      const data = await res.json();
      if (data && data.ok !== false) {
        cachedInsights = data;
        insightsAt = Date.now();
      }
    } catch {
      /* ignore */
    }
    return cachedInsights;
  }

  function tabFeature(tab) {
    const map = {
      home: "home",
      chat: "coach",
      code: "code",
      notebook: "notebook",
      voice: "voice",
      flashcards: "flashcards",
      math: "math",
      focus: "focus",
      gaps: "gaps",
      planner: "planner",
      exam: "exam",
      diagnostic: "diagnostic",
      progress: "progress",
      profile: "profile",
      learning: "home",
    };
    return map[tab] || tab || "home";
  }

  function onTab(tab) {
    const feature = tabFeature(tab);
    track("tab_opened", feature, { tab: String(tab || "").slice(0, 24) });
    if (tab === "home") track("dashboard_viewed", "home");
    if (tab === "chat") track("ai_coach_opened", "coach");
    if (tab === "progress") track("progress_viewed", "progress");
    if (tab === "planner") track("planner_viewed", "planner");
    if (tab === "exam") track("exam_viewed", "exam");
    if (tab === "voice") track("voice_session_started", "voice", { source: "tab" });
  }

  async function bootAfterAuth() {
    if (started) return;
    started = true;
    loadLocalConsent();
    ensureClientSession();
    await loadRemoteConsent();
    await startSession();
    track("login_completed", "auth");
    track("session_started", "auth");
    const profile = api().getLearnerProfile?.();
    if (profile) await syncProfile(profile);
    await fetchInsights(true);
    if (window.StudentJourney?.applyServerInsights) {
      window.StudentJourney.applyServerInsights(cachedInsights);
    }
  }

  function wireConsentControls() {
    document.getElementById("saveAnalyticsConsentBtn")?.addEventListener("click", () => {
      syncConsent({
        analytics_enabled: document.getElementById("prefAnalyticsEnabled")?.checked !== false,
        learning_analytics_enabled: document.getElementById("prefLearningAnalyticsEnabled")?.checked !== false,
        personalization_enabled: document.getElementById("prefPersonalizationEnabled")?.checked !== false,
      });
      api().showToast?.("Privacy preferences saved");
    });
  }

  window.StudentAnalytics = {
    track,
    flush,
    syncProfile,
    syncConsent,
    recordLearning,
    fetchInsights,
    getInsights: () => cachedInsights,
    onTab,
    bootAfterAuth,
    endSession,
    getConsent: () => ({ ...consent }),
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", () => {
    flush();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadLocalConsent();
      wireConsentControls();
      syncConsentForm();
    });
  } else {
    loadLocalConsent();
    wireConsentControls();
    syncConsentForm();
  }
})();
