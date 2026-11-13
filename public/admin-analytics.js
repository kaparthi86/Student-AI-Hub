/**
 * Admin Analytics dashboard (allowlisted emails via ANALYTICS_ADMIN_EMAILS).
 */
(function initAdminAnalytics() {
  function api() {
    return window.StudentCoach || {};
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadDashboard() {
    const body = $("adminAnalyticsBody");
    const status = $("adminAnalyticsStatus");
    if (!body) return;
    if (status) status.textContent = "Loading…";
    body.innerHTML = `<p class="muted">Loading analytics…</p>`;
    const days = Number($("adminAnalyticsDays")?.value || 7);
    try {
      const res = await api().fetchAuthed?.(`/api/analytics/dashboard?days=${days}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        body.innerHTML = `<p class="muted">${escapeHtml(data?.error || "Could not load dashboard.")}</p>
          <p class="muted">Set <code>ANALYTICS_ADMIN_EMAILS</code> (or <code>FEEDBACK_REVIEW_EMAILS</code>) and run <code>supabase/student_intelligence.sql</code>.</p>`;
        if (status) status.textContent = "Unavailable";
        return;
      }
      if (status) status.textContent = `Updated ${new Date(data.generatedAt).toLocaleString()}`;
      renderDashboard(body, data);
    } catch (err) {
      body.innerHTML = `<p class="muted">${escapeHtml(err?.message || "Failed to load")}</p>`;
      if (status) status.textContent = "Error";
    }
  }

  function renderDashboard(body, data) {
    const k = data.kpis || {};
    body.innerHTML = `
      <div class="journey-stat-row journey-stat-row--wide">
        <div class="journey-stat"><span class="journey-stat-value">${fmt(k.registeredStudents)}</span><span class="journey-stat-label">Registered (profiles)</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${fmt(k.weeklyActiveStudents)}</span><span class="journey-stat-label">Active (${data.days}d)</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${fmtPct(k.onboardingCompletionPct)}</span><span class="journey-stat-label">Onboarding completion</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${fmtPct(k.retention7Pct)}</span><span class="journey-stat-label">Return rate (approx)</span></div>
      </div>
      <div class="journey-stat-row journey-stat-row--wide">
        <div class="journey-stat"><span class="journey-stat-value">${fmt(k.events)}</span><span class="journey-stat-label">Events</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${fmt(k.sessions)}</span><span class="journey-stat-label">Sessions</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${fmtPct(k.avgQuizAccuracyPct)}</span><span class="journey-stat-label">Avg quiz accuracy</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${fmt(k.learningActivityCount)}</span><span class="journey-stat-label">Learning activities</span></div>
      </div>
      <section class="journey-block">
        <h3>Feature adoption</h3>
        <ul class="journey-mastery-list">
          ${(data.featureAdoption || [])
            .map(
              (f) => `<li>
              <div class="journey-mastery-meta"><strong>${escapeHtml(f.feature)}</strong><span>${f.uniqueUsers} users · ${f.pctOfActive}%</span></div>
              <div class="journey-bar"><span style="width:${Math.min(100, f.pctOfActive || 0)}%"></span></div>
            </li>`,
            )
            .join("") || "<li class='muted'>No events yet</li>"}
        </ul>
      </section>
      <section class="journey-block">
        <h3>Top events</h3>
        <ul class="admin-event-list">
          ${(data.topEvents || [])
            .map((e) => `<li><code>${escapeHtml(e.event_name)}</code> <span>${e.count}</span></li>`)
            .join("") || "<li class='muted'>None</li>"}
        </ul>
      </section>
      <section class="journey-block">
        <h3>Learning outcomes</h3>
        <p class="muted">Most active subjects (period)</p>
        <ul class="admin-event-list">
          ${(data.topSubjects || [])
            .map((s) => `<li><strong>${escapeHtml(s.subject)}</strong> <span>${s.count}</span></li>`)
            .join("") || "<li class='muted'>No learning activity yet</li>"}
        </ul>
        <p class="muted" style="margin-top:0.75rem">Knowledge gaps flagged</p>
        <ul class="admin-event-list">
          ${(data.challengingTopics || [])
            .map(
              (t) =>
                `<li><strong>${escapeHtml(t.subject)}</strong>${t.topic && t.topic !== t.subject ? ` · ${escapeHtml(t.topic)}` : ""} <span>${t.mastery_pct != null ? `${t.mastery_pct}%` : "gap"}</span></li>`,
            )
            .join("") || "<li class='muted'>None flagged</li>"}
        </ul>
      </section>
      <p class="muted">Illustrative of live product data once events flow. No emails or chat content are stored in analytics events.</p>
    `;
  }

  function fmt(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return String(n);
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return `${n}%`;
  }

  function onAdminTab() {
    loadDashboard();
  }

  window.AdminAnalytics = { onTab: onAdminTab, reload: loadDashboard };

  document.addEventListener("click", (e) => {
    if (e.target.closest?.("#adminAnalyticsRefreshBtn")) {
      e.preventDefault();
      loadDashboard();
    }
  });
  document.getElementById("adminAnalyticsDays")?.addEventListener("change", () => loadDashboard());
})();
