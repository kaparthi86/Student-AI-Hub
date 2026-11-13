/**
 * Adaptive Learning Journey (P0/P1): daily plan, progress, planner, memory,
 * diagnostic, exam prep, and smart revision. Depends on window.StudentCoach.
 */
(function initJourney() {
  const JOURNEY_KEY = "student_ai_journey_v1";
  const MASTERY_KEY = "student_ai_topic_mastery_v1";
  const FOCUS_KEY = "student_ai_focus_sessions_v1";
  const ONBOARD_KEY = "student_ai_onboard_v1";

  const api = () => window.StudentCoach || {};

  function $(id) {
    return document.getElementById(id);
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function weekStartKey(d = new Date()) {
    const x = new Date(d);
    const day = x.getDay();
    const diff = (day + 6) % 7; // Monday start
    x.setDate(x.getDate() - diff);
    return x.toISOString().slice(0, 10);
  }

  function defaultJourney() {
    return {
      version: 1,
      onboardingDone: false,
      learningGoal: "",
      weeklyGoals: { target: 6, completed: 0, weekStart: weekStartKey() },
      dailyPlan: { date: "", items: [] },
      memory: {
        recentTopics: [],
        struggles: [],
        strengths: [],
        lastSummary: "",
        preferredStyleNote: "",
      },
      diagnostic: { lastAt: "", scores: {}, weak: [], strong: [], questions: [] },
      exam: {
        name: "",
        subject: "",
        targetDate: "",
        readiness: 0,
        plan: [],
        lastMockAt: "",
        lastMockScore: null,
      },
      revisionQueue: [],
      studyMinutes: { total: 0, byDay: {} },
      quizStats: { attempts: 0, correct: 0, byTopic: {} },
      completedPlanIds: {},
    };
  }

  function loadJourney() {
    try {
      const parsed = JSON.parse(localStorage.getItem(JOURNEY_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return defaultJourney();
      const base = defaultJourney();
      return {
        ...base,
        ...parsed,
        weeklyGoals: { ...base.weeklyGoals, ...(parsed.weeklyGoals || {}) },
        dailyPlan: { ...base.dailyPlan, ...(parsed.dailyPlan || {}) },
        memory: { ...base.memory, ...(parsed.memory || {}) },
        diagnostic: { ...base.diagnostic, ...(parsed.diagnostic || {}) },
        exam: { ...base.exam, ...(parsed.exam || {}) },
        studyMinutes: { ...base.studyMinutes, ...(parsed.studyMinutes || {}) },
        quizStats: { ...base.quizStats, ...(parsed.quizStats || {}) },
        completedPlanIds: parsed.completedPlanIds || {},
        revisionQueue: Array.isArray(parsed.revisionQueue) ? parsed.revisionQueue : [],
      };
    } catch {
      return defaultJourney();
    }
  }

  let journey = loadJourney();
  let serverInsights = null;

  function saveJourney() {
    try {
      localStorage.setItem(JOURNEY_KEY, JSON.stringify(journey));
    } catch {
      /* ignore */
    }
    if (typeof api().scheduleWorkspaceSync === "function") api().scheduleWorkspaceSync();
  }

  function loadMasteryMap() {
    try {
      return JSON.parse(localStorage.getItem(MASTERY_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function focusSessionCount() {
    try {
      const rows = JSON.parse(localStorage.getItem(FOCUS_KEY) || "[]");
      return Array.isArray(rows) ? rows.length : 0;
    } catch {
      return 0;
    }
  }

  function subjectList() {
    const profile = api().getLearnerProfile?.() || {};
    const raw = String(profile.subjects || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (raw.length) return raw;
    return ["Algebra", "Biology", "Python"];
  }

  function topicMasteryScore(topic, map) {
    const row = map[topic] || { know: 0, almost: 0, need: 0 };
    const total = row.know + row.almost + row.need;
    if (!total) return null;
    return Math.round(((row.know * 1 + row.almost * 0.55) / total) * 100);
  }

  function overallMastery() {
    const map = loadMasteryMap();
    const topics = Object.keys(map);
    const diag = journey.diagnostic?.scores || {};
    const scores = [];
    for (const t of topics) {
      const s = topicMasteryScore(t, map);
      if (s != null) scores.push(s);
    }
    for (const [t, pct] of Object.entries(diag)) {
      if (Number.isFinite(Number(pct))) scores.push(Number(pct));
    }
    if (!scores.length) {
      // Seed from activity so the dashboard never feels empty after first use.
      const hist =
        (api().getChatHistory?.() || []).length +
        (api().getCodeHistory?.() || []).length +
        (api().getNotebookHistory?.() || []).length;
      if (!hist && !focusSessionCount()) return 0;
      return Math.min(42, 12 + hist * 2 + focusSessionCount() * 3);
    }
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  function ensureWeek() {
    const ws = weekStartKey();
    if (journey.weeklyGoals.weekStart !== ws) {
      journey.weeklyGoals = { target: 6, completed: 0, weekStart: ws };
      journey.completedPlanIds = {};
      saveJourney();
    }
  }

  function actionForTopic(topic, score) {
    if (score == null || score < 55) {
      return { action: "Practice weak concepts", tab: "chat", mode: "quiz", minutes: 15 };
    }
    if (score < 75) {
      return { action: "Review flashcards", tab: "flashcards", mode: "", minutes: 10 };
    }
    return { action: "Explain & deepen", tab: "chat", mode: "explain", minutes: 12 };
  }

  function applyServerInsights(insights) {
    if (!insights || typeof insights !== "object") return;
    serverInsights = insights;
    const gaps = Array.isArray(insights.gaps) ? insights.gaps : [];
    for (const g of gaps) {
      const topic = String(g.topic || g.subject || "").trim();
      if (topic) enqueueRevision(topic, 1);
    }
    if (gaps.length) {
      journey.diagnostic.weak = [
        ...new Set([
          ...(journey.diagnostic.weak || []),
          ...gaps.map((g) => String(g.topic || g.subject || "").trim()).filter(Boolean),
        ]),
      ].slice(0, 10);
      const scores = { ...(journey.diagnostic.scores || {}) };
      for (const g of gaps) {
        const key = String(g.topic || g.subject || "").trim();
        if (key && g.mastery_pct != null) scores[key] = Number(g.mastery_pct);
      }
      journey.diagnostic.scores = scores;
      saveJourney();
      buildDailyPlan(true);
      renderAllVisible();
    } else {
      renderHomeJourney();
    }
  }

  function buildDailyPlan(force = false) {
    ensureWeek();
    if (!force && journey.dailyPlan.date === todayKey() && journey.dailyPlan.items?.length) {
      return journey.dailyPlan;
    }
    const subjects = subjectList();
    const map = loadMasteryMap();
    const weak = [...(journey.diagnostic.weak || [])];
    const serverRecs = Array.isArray(serverInsights?.recommendations)
      ? serverInsights.recommendations
      : [];
    const serverWeak = (serverInsights?.gaps || [])
      .map((g) => String(g.topic || g.subject || "").trim())
      .filter(Boolean);
    const revisionDue = (journey.revisionQueue || [])
      .filter((r) => !r.dueAt || r.dueAt <= Date.now())
      .map((r) => r.topic)
      .filter(Boolean);
    const topics = [];
    for (const w of [...serverWeak, ...weak, ...revisionDue]) {
      if (w && !topics.includes(w)) topics.push(w);
    }
    for (const s of subjects) {
      if (!topics.includes(s)) topics.push(s);
    }
    // Prefer weak mastery topics first
    topics.sort((a, b) => {
      const sa =
        serverInsights?.gaps?.find((g) => (g.topic || g.subject) === a)?.mastery_pct ??
        topicMasteryScore(a, map);
      const sb =
        serverInsights?.gaps?.find((g) => (g.topic || g.subject) === b)?.mastery_pct ??
        topicMasteryScore(b, map);
      return (sa ?? 40) - (sb ?? 40);
    });

    const profile = api().getLearnerProfile?.() || {};
    const examFocus = profile.examFocus || "";
    const items = topics.slice(0, 3).map((topic, i) => {
      const rec = serverRecs.find((r) => r.topic === topic || r.subject === topic);
      const score =
        serverInsights?.gaps?.find((g) => (g.topic || g.subject) === topic)?.mastery_pct ??
        topicMasteryScore(topic, map);
      const meta = actionForTopic(topic, score);
      let action = rec?.action || meta.action;
      let tab = rec?.tab || meta.tab;
      let mode = rec?.mode || meta.mode || "";
      let minutes = rec?.minutes || meta.minutes;
      if (i === 2 && /python|code|java|js|programming/i.test(topic)) {
        action = "Coding practice";
        tab = "code";
      } else if (examFocus && examFocus !== "none" && i === 0 && !rec) {
        action = "Exam-style practice";
        tab = "exam";
      }
      return {
        id: `${todayKey()}-${i}-${topic.toLowerCase().replace(/\s+/g, "-").slice(0, 24)}`,
        subject: topic,
        topic,
        minutes,
        action,
        tab,
        mode,
        recommended: i === 0,
        fromIntelligence: Boolean(rec || serverWeak.includes(topic)),
        done: Boolean(journey.completedPlanIds[`${todayKey()}-${i}-${topic.toLowerCase().replace(/\s+/g, "-").slice(0, 24)}`]),
      };
    });

    // Fix done flags against completedPlanIds
    for (const item of items) {
      item.done = Boolean(journey.completedPlanIds[item.id]);
    }

    journey.dailyPlan = { date: todayKey(), items };
    saveJourney();
    if (force && window.StudentAnalytics?.track) {
      window.StudentAnalytics.track("study_plan_created", "planner", {
        items: items.length,
        from_intelligence: items.some((it) => it.fromIntelligence),
      });
    }
    return journey.dailyPlan;
  }

  function coachMemoryPayload() {
    ensureWeek();
    const map = loadMasteryMap();
    const struggles = Object.entries(map)
      .map(([topic, row]) => ({
        topic,
        need: row.need || 0,
        score: topicMasteryScore(topic, map),
      }))
      .filter((r) => (r.need > 0 || (r.score != null && r.score < 60)))
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 6)
      .map((r) => ({ topic: r.topic, count: r.need || 1 }));

    const strengths = Object.entries(map)
      .map(([topic, row]) => ({ topic, score: topicMasteryScore(topic, map), know: row.know || 0 }))
      .filter((r) => r.score != null && r.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => ({ topic: r.topic, score: r.score }));

    journey.memory.struggles = struggles.length ? struggles : journey.memory.struggles;
    journey.memory.strengths = strengths.length ? strengths : journey.memory.strengths;

    const recent = journey.memory.recentTopics || [];
    const bits = [];
    if (recent.length) bits.push(`Recently studied: ${recent.slice(0, 5).map((t) => t.topic).join(", ")}.`);
    if (journey.memory.struggles.length) {
      bits.push(`Needs support on: ${journey.memory.struggles.map((s) => s.topic).join(", ")}.`);
    }
    if (journey.memory.strengths.length) {
      bits.push(`Stronger in: ${journey.memory.strengths.map((s) => s.topic).join(", ")}.`);
    }
    if (journey.learningGoal) bits.push(`Learning goal: ${journey.learningGoal}.`);
    if (journey.exam.name) {
      bits.push(
        `Exam prep: ${journey.exam.name}${journey.exam.targetDate ? ` by ${journey.exam.targetDate}` : ""} (readiness ~${journey.exam.readiness}%).`,
      );
    }
    if (serverInsights?.gaps?.length) {
      bits.push(
        `Server learning intelligence gaps: ${serverInsights.gaps
          .slice(0, 4)
          .map((g) => g.topic || g.subject)
          .join(", ")}.`,
      );
      for (const g of serverInsights.gaps.slice(0, 4)) {
        const topic = g.topic || g.subject;
        if (topic && !journey.memory.struggles.some((s) => s.topic === topic)) {
          journey.memory.struggles.push({ topic, count: 1 });
        }
      }
      journey.memory.struggles = journey.memory.struggles.slice(0, 6);
    }
    if (serverInsights?.strengths?.length) {
      for (const s of serverInsights.strengths.slice(0, 3)) {
        const topic = s.topic || s.subject;
        if (topic && !journey.memory.strengths.some((x) => x.topic === topic)) {
          journey.memory.strengths.push({ topic, score: s.mastery_pct || 70 });
        }
      }
      journey.memory.strengths = journey.memory.strengths.slice(0, 5);
    }
    journey.memory.lastSummary = bits.join(" ").slice(0, 500);
    saveJourney();

    return {
      recentTopics: (journey.memory.recentTopics || []).slice(0, 8),
      struggles: (journey.memory.struggles || []).slice(0, 6),
      strengths: (journey.memory.strengths || []).slice(0, 5),
      lastSummary: journey.memory.lastSummary || "",
      learningGoal: journey.learningGoal || "",
      examFocus: journey.exam.name || "",
      weeklyProgress: `${journey.weeklyGoals.completed}/${journey.weeklyGoals.target}`,
    };
  }

  function guessTopicFromText(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    const subjects = subjectList();
    const lower = t.toLowerCase();
    for (const s of subjects) {
      if (lower.includes(s.toLowerCase())) return s;
    }
    // First meaningful phrase
    const cleaned = t.replace(/^(explain|help|what is|how do|solve|practice)\s+/i, "").trim();
    return cleaned.slice(0, 48) || "General";
  }

  function recordLearningEvent(evt = {}) {
    ensureWeek();
    const topic = String(evt.topic || guessTopicFromText(evt.message || "") || "").trim().slice(0, 64);
    const mode = String(evt.mode || "learn");
    const minutes = Math.max(1, Math.min(60, Number(evt.minutes) || 5));
    const day = todayKey();

    if (topic) {
      const recent = Array.isArray(journey.memory.recentTopics) ? journey.memory.recentTopics : [];
      const next = [{ topic, at: new Date().toISOString(), mode }, ...recent.filter((r) => r.topic !== topic)];
      journey.memory.recentTopics = next.slice(0, 12);
      if (evt.struggled) {
        const struggles = Array.isArray(journey.memory.struggles) ? journey.memory.struggles : [];
        const found = struggles.find((s) => s.topic === topic);
        if (found) {
          found.count = (found.count || 0) + 1;
          found.lastAt = new Date().toISOString();
        } else struggles.unshift({ topic, count: 1, lastAt: new Date().toISOString() });
        journey.memory.struggles = struggles.slice(0, 10);
        enqueueRevision(topic, 1);
      }
    }

    journey.studyMinutes.byDay[day] = (journey.studyMinutes.byDay[day] || 0) + minutes;
    journey.studyMinutes.total = (journey.studyMinutes.total || 0) + minutes;

    if (evt.quiz) {
      journey.quizStats.attempts += 1;
      if (evt.correct) journey.quizStats.correct += 1;
      if (topic) {
        const row = journey.quizStats.byTopic[topic] || { attempts: 0, correct: 0 };
        row.attempts += 1;
        if (evt.correct) row.correct += 1;
        journey.quizStats.byTopic[topic] = row;
      }
    }

    if (evt.planItemId && !journey.completedPlanIds[evt.planItemId]) {
      journey.completedPlanIds[evt.planItemId] = true;
      journey.weeklyGoals.completed = Math.min(
        journey.weeklyGoals.target,
        (journey.weeklyGoals.completed || 0) + 1,
      );
      const item = journey.dailyPlan.items?.find((i) => i.id === evt.planItemId);
      if (item) item.done = true;
      if (window.StudentAnalytics?.track) {
        window.StudentAnalytics.track("study_plan_item_completed", "journey", {
          topic: (item && item.topic) || topic || "",
        });
      }
    }

    saveJourney();
    renderAllVisible();
  }

  function enqueueRevision(topic, priority = 2) {
    if (!topic) return;
    const dueAt = Date.now() + (priority <= 1 ? 4 : 24) * 60 * 60 * 1000;
    const q = Array.isArray(journey.revisionQueue) ? journey.revisionQueue : [];
    const existing = q.find((r) => r.topic === topic);
    if (existing) {
      existing.dueAt = Math.min(existing.dueAt || dueAt, dueAt);
      existing.priority = Math.min(existing.priority || 5, priority);
    } else {
      q.push({ topic, dueAt, priority, addedAt: new Date().toISOString() });
    }
    journey.revisionQueue = q.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0)).slice(0, 24);
    saveJourney();
  }

  function markPlanItemDone(id) {
    recordLearningEvent({ planItemId: id, minutes: 10, topic: "" });
  }

  function coachRecommendBlurb() {
    if (serverInsights?.nudge) return serverInsights.nudge;
    const mem = coachMemoryPayload();
    const plan = buildDailyPlan();
    const first = plan.items?.[0];
    if (mem.struggles?.length && first) {
      return `You're building momentum. Let's focus on ${first.topic} next — ${first.action.toLowerCase()}.`;
    }
    if (mem.strengths?.length) {
      return `You're doing well in ${mem.strengths[0].topic}. ${first ? `Next up: ${first.topic}.` : "Ready when you are."}`;
    }
    if (first) return `Your coach recommends starting with ${first.topic} (${first.minutes} min).`;
    return "Set your subjects in Profile so your coach can personalize today's plan.";
  }

  /* ---------- Rendering ---------- */

  function renderHomeJourney() {
    const mount = $("journeyHomeMount");
    if (!mount) return;
    ensureWeek();
    const plan = buildDailyPlan();
    const mastery = overallMastery();
    const weekly = journey.weeklyGoals;
    const name = typeof api().coachDisplayName === "function" ? api().coachDisplayName() : "there";

    mount.hidden = false;
    mount.innerHTML = `
      <section class="journey-dash" aria-labelledby="journeyDashTitle">
        <div class="journey-dash-head">
          <div>
            <p class="coach-kicker">Your coach</p>
            <h3 class="journey-dash-title" id="journeyDashTitle">Good ${greetingHour()}, ${escapeHtml(name)}</h3>
            <p class="muted journey-dash-lead">Your personalized learning journey</p>
          </div>
          <div class="journey-stat-row">
            <div class="journey-stat">
              <span class="journey-stat-value">${mastery}%</span>
              <span class="journey-stat-label">Learning mastery</span>
            </div>
            <div class="journey-stat">
              <span class="journey-stat-value">${weekly.completed}/${weekly.target}</span>
              <span class="journey-stat-label">Weekly goals</span>
            </div>
          </div>
        </div>
        <div class="journey-plan">
          <div class="journey-plan-head">
            <h4>Today's learning plan</h4>
            <button type="button" class="ghost-btn journey-refresh-plan" data-journey-action="refresh-plan">Refresh</button>
          </div>
          <ol class="journey-plan-list">
            ${(plan.items || [])
              .map(
                (item, idx) => `
              <li class="journey-plan-item${item.recommended ? " is-recommended" : ""}${item.done ? " is-done" : ""}">
                <div class="journey-plan-main">
                  <strong>${escapeHtml(item.topic)}</strong>
                  <span class="muted">${item.minutes} minutes · ${escapeHtml(item.action)}</span>
                </div>
                <div class="journey-plan-actions">
                  ${item.recommended && !item.done ? '<span class="journey-badge">Recommended</span>' : ""}
                  ${item.fromIntelligence && !item.done ? '<span class="journey-badge">From progress</span>' : ""}
                  ${item.done ? '<span class="journey-badge journey-badge--done">Done</span>' : ""}
                  <button type="button" class="primary-btn journey-start-btn" data-journey-start="${idx}">Start</button>
                  ${!item.done ? `<button type="button" class="ghost-btn" data-journey-done="${escapeAttr(item.id)}">Mark done</button>` : ""}
                </div>
              </li>`,
              )
              .join("")}
          </ol>
        </div>
        <aside class="journey-coach-note">
          <p class="journey-coach-note-label">Your coach recommends</p>
          <p>${escapeHtml(coachRecommendBlurb())}</p>
          <div class="coach-hero-actions">
            <button type="button" class="ghost-btn" data-coach-tab="diagnostic">Take a quick check</button>
            <button type="button" class="ghost-btn" data-coach-tab="progress">View progress</button>
            <button type="button" class="ghost-btn" data-coach-tab="voice">Talk with coach</button>
          </div>
        </aside>
      </section>
    `;
  }

  function greetingHour() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function renderProgressPanel() {
    const root = $("panelProgress");
    if (!root || root.hidden) return;
    ensureWeek();
    const mastery = overallMastery();
    const map = loadMasteryMap();
    const subjects = subjectList();
    const rows = subjects.map((s) => {
      const score = topicMasteryScore(s, map) ?? journey.diagnostic.scores?.[s] ?? null;
      return { topic: s, score };
    });
    for (const [topic, pct] of Object.entries(journey.diagnostic.scores || {})) {
      if (!rows.find((r) => r.topic === topic)) rows.push({ topic, score: Number(pct) });
    }
    const weak = journey.diagnostic.weak?.length
      ? journey.diagnostic.weak
      : rows.filter((r) => r.score != null && r.score < 60).map((r) => r.topic);
    const revision = (journey.revisionQueue || []).slice(0, 6);
    const minutesToday = journey.studyMinutes.byDay[todayKey()] || 0;

    const body = $("progressPanelBody");
    if (!body) return;
    body.innerHTML = `
      <div class="journey-stat-row journey-stat-row--wide">
        <div class="journey-stat"><span class="journey-stat-value">${mastery}%</span><span class="journey-stat-label">Overall mastery</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${journey.weeklyGoals.completed}/${journey.weeklyGoals.target}</span><span class="journey-stat-label">Weekly goals</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${minutesToday}</span><span class="journey-stat-label">Minutes today</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${journey.quizStats.attempts}</span><span class="journey-stat-label">Practice checks</span></div>
      </div>
      <section class="journey-block">
        <h3>Subject mastery</h3>
        <ul class="journey-mastery-list">
          ${rows
            .map((r) => {
              const pct = r.score == null ? 0 : r.score;
              const label = r.score == null ? "Not assessed" : `${pct}%`;
              return `<li>
                <div class="journey-mastery-meta"><strong>${escapeHtml(r.topic)}</strong><span>${label}</span></div>
                <div class="journey-bar"><span style="width:${pct}%"></span></div>
              </li>`;
            })
            .join("")}
        </ul>
      </section>
      <section class="journey-block">
        <h3>Knowledge gaps</h3>
        <p class="muted">${weak.length ? escapeHtml(weak.join(", ")) : "No gaps flagged yet. Take a diagnostic or practice a quiz."}</p>
        <div class="coach-hero-actions">
          <button type="button" class="primary-btn" data-coach-tab="diagnostic">Start diagnostic</button>
          <button type="button" class="ghost-btn" data-coach-tab="gaps">Scan recent Ask work</button>
        </div>
      </section>
      <section class="journey-block">
        <h3>Smart revision</h3>
        ${
          revision.length
            ? `<ul class="journey-revision-list">${revision
                .map((r) => {
                  const due = r.dueAt && r.dueAt <= Date.now() ? "Due now" : "Upcoming";
                  return `<li><strong>${escapeHtml(r.topic)}</strong> <span class="muted">${due}</span>
                    <button type="button" class="ghost-btn" data-journey-revise="${escapeAttr(r.topic)}">Revise</button></li>`;
                })
                .join("")}</ul>`
            : `<p class="muted">Revision queue fills as you practice weak topics.</p>`
        }
      </section>
    `;
  }

  function renderPlannerPanel() {
    const body = $("plannerPanelBody");
    if (!body || $("panelPlanner")?.hidden) return;
    ensureWeek();
    const plan = buildDailyPlan();
    const weekDays = [];
    const start = new Date(weekStartKey());
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const mins = journey.studyMinutes.byDay[key] || 0;
      weekDays.push({
        key,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        mins,
        isToday: key === todayKey(),
      });
    }
    const subjects = subjectList();
    body.innerHTML = `
      <p class="muted">Goals become daily activities. Complete items on Home to advance weekly goals (${journey.weeklyGoals.completed}/${journey.weeklyGoals.target}).</p>
      <div class="journey-week-grid">
        ${weekDays
          .map(
            (d) => `<div class="journey-week-day${d.isToday ? " is-today" : ""}">
            <strong>${d.label}</strong>
            <span>${d.mins || "—"} min</span>
          </div>`,
          )
          .join("")}
      </div>
      <section class="journey-block">
        <h3>This week's focus</h3>
        <ul class="journey-plan-list">
          ${subjects
            .slice(0, 5)
            .map((s, i) => {
              const score = topicMasteryScore(s, loadMasteryMap());
              const meta = actionForTopic(s, score);
              return `<li class="journey-plan-item">
                <div class="journey-plan-main"><strong>${escapeHtml(s)}</strong>
                <span class="muted">${meta.minutes} min · ${escapeHtml(meta.action)}</span></div>
                <button type="button" class="primary-btn" data-journey-plan-go="${i}" data-tab="${meta.tab}" data-topic="${escapeAttr(s)}" data-mode="${meta.mode || ""}">Open</button>
              </li>`;
            })
            .join("")}
        </ul>
      </section>
      <section class="journey-block">
        <h3>Today</h3>
        <ol class="journey-plan-list">
          ${(plan.items || [])
            .map(
              (item, idx) => `<li class="journey-plan-item${item.done ? " is-done" : ""}">
              <div class="journey-plan-main"><strong>${escapeHtml(item.topic)}</strong>
              <span class="muted">${item.minutes} min · ${escapeHtml(item.action)}</span></div>
              <button type="button" class="primary-btn" data-journey-start="${idx}">Start</button>
            </li>`,
            )
            .join("")}
        </ol>
        <button type="button" class="ghost-btn" data-journey-action="refresh-plan">Rebuild today's plan</button>
      </section>
    `;
  }

  function renderExamPanel() {
    const body = $("examPanelBody");
    if (!body || $("panelExam")?.hidden) return;
    const ex = journey.exam;
    const profile = api().getLearnerProfile?.() || {};
    body.innerHTML = `
      <form id="examSetupForm" class="journey-form">
        <label>Exam name
          <input id="examNameInput" type="text" maxlength="80" value="${escapeAttr(ex.name || profile.examFocus || "")}" placeholder="e.g. JEE Main, Board finals" />
        </label>
        <label>Subject
          <input id="examSubjectInput" type="text" maxlength="80" value="${escapeAttr(ex.subject || subjectList()[0] || "")}" placeholder="e.g. Physics" />
        </label>
        <label>Target date
          <input id="examDateInput" type="date" value="${escapeAttr(ex.targetDate || "")}" />
        </label>
        <button type="submit" class="primary-btn">Save exam plan</button>
      </form>
      <div class="journey-stat-row">
        <div class="journey-stat"><span class="journey-stat-value">${ex.readiness || 0}%</span><span class="journey-stat-label">Exam readiness</span></div>
        <div class="journey-stat"><span class="journey-stat-value">${ex.lastMockScore == null ? "—" : `${ex.lastMockScore}%`}</span><span class="journey-stat-label">Last mock</span></div>
      </div>
      <section class="journey-block">
        <h3>Preparation plan</h3>
        ${
          (ex.plan || []).length
            ? `<ol class="journey-plan-list">${ex.plan
                .map(
                  (p, i) => `<li class="journey-plan-item">
                  <div class="journey-plan-main"><strong>${escapeHtml(p.topic)}</strong>
                  <span class="muted">${escapeHtml(p.focus)}</span></div>
                  <button type="button" class="primary-btn" data-exam-practice="${i}">Practice</button>
                </li>`,
                )
                .join("")}</ol>`
            : `<p class="muted">Save your exam details to generate a topic-wise plan.</p>`
        }
      </section>
      <section class="journey-block">
        <h3>Mock exam</h3>
        <p class="muted">Timed practice using your subject focus. Results update readiness and revision.</p>
        <button type="button" class="primary-btn" id="examMockBtn">Start 5-question mock</button>
        <div id="examMockMount" class="journey-quiz-mount"></div>
      </section>
    `;
    $("examSetupForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      saveExamSetup();
    });
    $("examMockBtn")?.addEventListener("click", () => startExamMock());
    body.querySelectorAll("[data-exam-practice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-exam-practice"));
        const row = journey.exam.plan?.[i];
        if (!row) return;
        api().setMainTab?.("chat");
        if (typeof api().setLearnStudyMode === "function") api().setLearnStudyMode("quiz");
        setTimeout(() => {
          const input = document.getElementById("chatSearchInput") || document.getElementById("chatFollowupInput");
          const submit = document.getElementById("chatSearchSubmit") || document.getElementById("chatFollowupSubmit");
          if (input && submit) {
            input.value = `Exam practice: ${row.topic}. ${row.focus}. Give me one exam-style question, wait for my answer, then grade it.`;
            submit.click();
          }
        }, 80);
      });
    });
  }

  function saveExamSetup() {
    const name = String($("examNameInput")?.value || "").trim().slice(0, 80);
    const subject = String($("examSubjectInput")?.value || "").trim().slice(0, 80);
    const targetDate = String($("examDateInput")?.value || "").trim();
    journey.exam.name = name;
    journey.exam.subject = subject;
    journey.exam.targetDate = targetDate;
    const topics = subjectList();
    const focusTopics = subject ? [subject, ...topics.filter((t) => t !== subject)] : topics;
    journey.exam.plan = focusTopics.slice(0, 6).map((topic, i) => ({
      topic,
      focus:
        i === 0
          ? "Core concepts + common traps"
          : i === 1
            ? "Timed practice questions"
            : "Revision and weak-spot drills",
    }));
    journey.exam.readiness = Math.max(journey.exam.readiness || 0, Math.min(35, overallMastery()));
    saveJourney();
    api().showToast?.("Exam plan saved");
    renderExamPanel();
    renderHomeJourney();
  }

  let mockState = null;

  async function startExamMock() {
    const mount = $("examMockMount");
    if (!mount) return;
    mount.innerHTML = `<p class="muted">Preparing mock questions…</p>`;
    const subject = journey.exam.subject || subjectList()[0] || "General";
    try {
      const res = await api().fetchAuthed?.("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          topic: `${subject} exam preparation`,
          uiLanguage: api().getReplyLanguage?.() || "en",
        }),
      });
      const data = await res.json();
      const questions = Array.isArray(data?.questions) ? data.questions : [];
      if (!questions.length) {
        mockState = {
          i: 0,
          score: 0,
          questions: [
            { prompt: `Name one key concept in ${subject} and why it matters for exams.`, answer: "" },
            { prompt: `What is a common mistake students make in ${subject}?`, answer: "" },
            { prompt: `Explain a ${subject} idea in two steps.`, answer: "" },
            { prompt: `Give an exam-style tip for ${subject}.`, answer: "" },
            { prompt: `Which ${subject} topic should you revise first and why?`, answer: "" },
          ],
        };
      } else {
        mockState = {
          i: 0,
          score: 0,
          questions: questions.slice(0, 5).map((q) => ({
            prompt: String(q.prompt || "").trim(),
            answer: String(q.rubric || q.answer || "").trim(),
          })),
        };
      }
      renderMockStep();
    } catch (err) {
      mount.innerHTML = `<p class="muted">Could not start mock. Try Ask quiz mode instead.</p>`;
      api().showToast?.(String(err?.message || "Mock failed"));
    }
  }

  function renderMockStep() {
    const mount = $("examMockMount");
    if (!mount || !mockState) return;
    if (mockState.i >= mockState.questions.length) {
      const pct = Math.round((mockState.score / mockState.questions.length) * 100);
      journey.exam.lastMockAt = new Date().toISOString();
      journey.exam.lastMockScore = pct;
      journey.exam.readiness = Math.round((journey.exam.readiness || 0) * 0.5 + pct * 0.5);
      if (pct < 70) enqueueRevision(journey.exam.subject || subjectList()[0], 1);
      recordLearningEvent({
        topic: journey.exam.subject || "Exam",
        minutes: 15,
        quiz: true,
        correct: pct >= 60,
        struggled: pct < 60,
      });
      if (window.StudentAnalytics?.track) {
        window.StudentAnalytics.track("exam_mock_completed", "exam", {
          score_pct: pct,
          questions_count: mockState.questions.length,
          correct_answers: mockState.score,
        });
        window.StudentAnalytics.track("quiz_completed", "exam", {
          score_pct: pct,
          questions_count: mockState.questions.length,
        });
      }
      if (window.StudentAnalytics?.recordLearning) {
        window.StudentAnalytics.recordLearning({
          activity_type: "exam_mock",
          feature: "exam",
          subject: journey.exam.subject || "",
          questions_count: mockState.questions.length,
          correct_count: mockState.score,
          score_pct: pct,
        });
      }
      mount.innerHTML = `
        <div class="journey-quiz-result">
          <p><strong>Mock score: ${pct}%</strong></p>
          <p class="muted">Readiness updated to ${journey.exam.readiness}%. Weak topics were added to revision.</p>
          <button type="button" class="ghost-btn" data-coach-tab="progress">See progress</button>
        </div>`;
      saveJourney();
      return;
    }
    const q = mockState.questions[mockState.i];
    mount.innerHTML = `
      <div class="journey-quiz-card">
        <p class="muted">Question ${mockState.i + 1} of ${mockState.questions.length}</p>
        <p class="journey-quiz-prompt">${escapeHtml(q.prompt || "Practice question")}</p>
        <textarea id="examMockAnswer" rows="3" placeholder="Type your answer"></textarea>
        <div class="coach-hero-actions">
          <button type="button" class="primary-btn" id="examMockSubmit">Submit</button>
          <button type="button" class="ghost-btn" id="examMockSkip">Skip</button>
        </div>
        <p id="examMockFeedback" class="muted"></p>
      </div>`;
    $("examMockSubmit")?.addEventListener("click", () => gradeMockAnswer(false));
    $("examMockSkip")?.addEventListener("click", () => {
      mockState.i += 1;
      renderMockStep();
    });
  }

  function gradeMockAnswer(skip) {
    if (!mockState) return;
    const q = mockState.questions[mockState.i];
    const ans = String($("examMockAnswer")?.value || "").trim();
    const fb = $("examMockFeedback");
    if (!skip && ans.length < 2) {
      if (fb) fb.textContent = "Write a short answer first.";
      return;
    }
    let correct = false;
    if (q.answer && ans) {
      const a = q.answer.toLowerCase();
      const u = ans.toLowerCase();
      correct = a.includes(u.slice(0, 24)) || u.includes(a.slice(0, 24)) || ans.length > 40;
    } else {
      correct = ans.length >= 12;
    }
    if (correct) mockState.score += 1;
    if (fb) {
      fb.textContent = correct
        ? "Nice — counted as solid."
        : q.answer
          ? `Review point: ${q.answer.slice(0, 160)}`
          : "Noted — keep practicing this topic.";
    }
    setTimeout(() => {
      mockState.i += 1;
      renderMockStep();
    }, 700);
  }

  function renderDiagnosticPanel() {
    const body = $("diagnosticPanelBody");
    if (!body || $("panelDiagnostic")?.hidden) return;
    const last = journey.diagnostic.lastAt
      ? new Date(journey.diagnostic.lastAt).toLocaleString()
      : "Not taken yet";
    body.innerHTML = `
      <p class="muted">A short check finds strong and weak topics so your daily plan stays honest.</p>
      <p><strong>Last check:</strong> ${escapeHtml(last)}</p>
      ${
        journey.diagnostic.weak?.length
          ? `<p><strong>Weak:</strong> ${escapeHtml(journey.diagnostic.weak.join(", "))}</p>`
          : ""
      }
      ${
        journey.diagnostic.strong?.length
          ? `<p><strong>Strong:</strong> ${escapeHtml(journey.diagnostic.strong.join(", "))}</p>`
          : ""
      }
      <button type="button" class="primary-btn" id="diagnosticStartBtn">Start 5-question diagnostic</button>
      <div id="diagnosticMount" class="journey-quiz-mount"></div>
    `;
    $("diagnosticStartBtn")?.addEventListener("click", () => startDiagnostic());
  }

  let diagState = null;

  async function startDiagnostic() {
    const mount = $("diagnosticMount");
    if (!mount) return;
    mount.innerHTML = `<p class="muted">Building your check…</p>`;
    const subjects = subjectList();
    const topic = subjects.slice(0, 3).join(", ");
    try {
      const res = await api().fetchAuthed?.("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          topic: `Diagnostic check covering: ${topic}`,
          uiLanguage: api().getReplyLanguage?.() || "en",
        }),
      });
      const data = await res.json();
      const questions = Array.isArray(data?.questions) ? data.questions : [];
      if (questions.length) {
        diagState = {
          i: 0,
          results: [],
          questions: questions.slice(0, 5).map((q, idx) => ({
            prompt: String(q.prompt || "").trim(),
            answer: String(q.rubric || "").trim(),
            topic: String(q.topic || subjects[idx % subjects.length] || "General"),
          })),
        };
      } else {
        diagState = {
          i: 0,
          results: [],
          questions: subjects.slice(0, 5).map((s) => ({
            prompt: `In one or two sentences, explain a core idea from ${s}.`,
            answer: "",
            topic: s,
          })),
        };
      }
      renderDiagStep();
    } catch {
      diagState = {
        i: 0,
        results: [],
        questions: subjects.slice(0, 5).map((s) => ({
          prompt: `What is one thing you find hard about ${s}?`,
          answer: "",
          topic: s,
        })),
      };
      renderDiagStep();
    }
  }

  function renderDiagStep() {
    const mount = $("diagnosticMount");
    if (!mount || !diagState) return;
    if (diagState.i >= diagState.questions.length) {
      finishDiagnostic();
      return;
    }
    const q = diagState.questions[diagState.i];
    mount.innerHTML = `
      <div class="journey-quiz-card">
        <p class="muted">${escapeHtml(q.topic)} · ${diagState.i + 1}/${diagState.questions.length}</p>
        <p class="journey-quiz-prompt">${escapeHtml(q.prompt)}</p>
        <textarea id="diagAnswer" rows="3" placeholder="Your answer"></textarea>
        <div class="coach-hero-actions">
          <button type="button" class="primary-btn" id="diagSubmit">Submit</button>
          <button type="button" class="ghost-btn" id="diagWeak">I'm unsure</button>
        </div>
      </div>`;
    $("diagSubmit")?.addEventListener("click", () => {
      const ans = String($("diagAnswer")?.value || "").trim();
      const ok = ans.length >= 20 || (q.answer && ans.length >= 8);
      diagState.results.push({ topic: q.topic, correct: ok });
      diagState.i += 1;
      renderDiagStep();
    });
    $("diagWeak")?.addEventListener("click", () => {
      diagState.results.push({ topic: q.topic, correct: false });
      diagState.i += 1;
      renderDiagStep();
    });
  }

  function finishDiagnostic() {
    const byTopic = {};
    for (const r of diagState.results) {
      const row = byTopic[r.topic] || { ok: 0, n: 0 };
      row.n += 1;
      if (r.correct) row.ok += 1;
      byTopic[r.topic] = row;
    }
    const scores = {};
    const weak = [];
    const strong = [];
    for (const [topic, row] of Object.entries(byTopic)) {
      const pct = Math.round((row.ok / row.n) * 100);
      scores[topic] = pct;
      if (pct < 60) {
        weak.push(topic);
        enqueueRevision(topic, 1);
      } else if (pct >= 75) strong.push(topic);
    }
    journey.diagnostic = {
      lastAt: new Date().toISOString(),
      scores,
      weak,
      strong,
      questions: [],
    };
    saveJourney();
    buildDailyPlan(true);
    if (window.StudentAnalytics?.track) {
      window.StudentAnalytics.track("diagnostic_completed", "diagnostic", {
        weak_count: weak.length,
        strong_count: strong.length,
      });
      if (weak.length) {
        window.StudentAnalytics.track("knowledge_gap_detected", "diagnostic", {
          weak_count: weak.length,
        });
      }
    }
    if (window.StudentAnalytics?.recordLearning) {
      window.StudentAnalytics.recordLearning(
        {
          activity_type: "diagnostic",
          feature: "diagnostic",
          questions_count: diagState.results.length,
          correct_count: diagState.results.filter((r) => r.correct).length,
          score_pct: diagState.results.length
            ? Math.round(
                (diagState.results.filter((r) => r.correct).length / diagState.results.length) * 100,
              )
            : null,
        },
        Object.entries(scores).map(([subject, mastery_pct]) => ({
          subject,
          topic: subject,
          mastery_pct,
          knowledge_gap: mastery_pct < 60,
        })),
      );
    }
    const mount = $("diagnosticMount");
    if (mount) {
      mount.innerHTML = `
        <div class="journey-quiz-result">
          <p><strong>Diagnostic complete</strong></p>
          <p class="muted">Weak: ${weak.length ? escapeHtml(weak.join(", ")) : "none flagged"}</p>
          <p class="muted">Strong: ${strong.length ? escapeHtml(strong.join(", ")) : "keep practicing"}</p>
          <button type="button" class="primary-btn" data-coach-tab="home">See today's plan</button>
        </div>`;
    }
    api().showToast?.("Diagnostic saved — plan updated");
    renderProgressPanel();
    renderHomeJourney();
  }

  function renderAllVisible() {
    renderHomeJourney();
    if (!$("panelProgress")?.hidden) renderProgressPanel();
    if (!$("panelPlanner")?.hidden) renderPlannerPanel();
    if (!$("panelExam")?.hidden) renderExamPanel();
    if (!$("panelDiagnostic")?.hidden) renderDiagnosticPanel();
  }

  /* ---------- Onboarding ---------- */

  function maybeShowOnboarding() {
    try {
      if (localStorage.getItem(ONBOARD_KEY) === "1" || journey.onboardingDone) return;
    } catch {
      return;
    }
    const modal = $("journeyOnboardModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.hidden = false;
    let step = 1;
    const showStep = () => {
      modal.querySelectorAll("[data-onboard-step]").forEach((el) => {
        el.hidden = Number(el.getAttribute("data-onboard-step")) !== step;
      });
    };
    showStep();
    modal.onclick = (e) => {
      const next = e.target.closest?.("[data-onboard-next]");
      const skip = e.target.closest?.("[data-onboard-skip]");
      const finish = e.target.closest?.("[data-onboard-finish]");
      if (skip) {
        closeOnboarding(false);
        return;
      }
      if (next) {
        // capture step fields
        captureOnboardStep(step);
        step = Math.min(3, step + 1);
        showStep();
        return;
      }
      if (finish) {
        captureOnboardStep(3);
        closeOnboarding(true);
      }
    };
  }

  function captureOnboardStep(step) {
    const prefs = {};
    if (step === 1) {
      const level = modalRadio("onboardLevel");
      if (level) prefs.gradeLevel = level;
      const subjects = String($("onboardSubjects")?.value || "").trim();
      if (subjects) prefs.subjects = subjects.slice(0, 160);
    }
    if (step === 2) {
      const style = modalRadio("onboardStyle");
      if (style) prefs.explainStyle = style;
    }
    if (step === 3) {
      const goal = modalRadio("onboardGoal");
      if (goal) journey.learningGoal = goal;
    }
    if (Object.keys(prefs).length && typeof api().patchLearnerPrefs === "function") {
      api().patchLearnerPrefs(prefs);
    } else if (Object.keys(prefs).length) {
      try {
        const raw = JSON.parse(localStorage.getItem("student_ai_user_prefs_v1") || "{}");
        Object.assign(raw, prefs);
        localStorage.setItem("student_ai_user_prefs_v1", JSON.stringify(raw));
      } catch {
        /* ignore */
      }
    }
  }

  function modalRadio(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  }

  function closeOnboarding(completed) {
    const modal = $("journeyOnboardModal");
    if (modal) {
      modal.classList.add("hidden");
      modal.hidden = true;
    }
    journey.onboardingDone = true;
    saveJourney();
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
    if (window.StudentAnalytics?.track) {
      window.StudentAnalytics.track(completed ? "onboarding_completed" : "onboarding_skipped", "onboarding", {
        learning_goal: journey.learningGoal || "",
      });
    }
    if (completed) {
      buildDailyPlan(true);
      api().showToast?.("Your coach is ready");
      renderHomeJourney();
      if (window.StudentAnalytics?.syncProfile) {
        window.StudentAnalytics.syncProfile(api().getLearnerProfile?.() || {});
      }
    }
  }

  /* ---------- Events ---------- */

  function startPlanItem(idx) {
    const item = journey.dailyPlan.items?.[idx];
    if (!item) return;
    const tab = item.tab || "chat";
    if (item.mode && typeof api().setLearnStudyMode === "function") api().setLearnStudyMode(item.mode);
    api().setMainTab?.(tab);
    if (tab === "chat" || tab === "code") {
      setTimeout(() => {
        const input =
          tab === "code"
            ? document.getElementById("codeSearchInput") || document.getElementById("codeFollowupInput")
            : document.getElementById("chatSearchInput") || document.getElementById("chatFollowupInput");
        const submit =
          tab === "code"
            ? document.getElementById("codeSearchSubmit") || document.getElementById("codeFollowupSubmit")
            : document.getElementById("chatSearchSubmit") || document.getElementById("chatFollowupSubmit");
        if (input && submit) {
          input.value = `${item.action}: ${item.topic}. Keep it to about ${item.minutes} minutes of focused help.`;
          submit.click();
        }
      }, 100);
    }
  }

  function wireJourneyUi() {
    document.addEventListener("click", (e) => {
      const start = e.target.closest?.("[data-journey-start]");
      if (start) {
        e.preventDefault();
        startPlanItem(Number(start.getAttribute("data-journey-start")));
        return;
      }
      const done = e.target.closest?.("[data-journey-done]");
      if (done) {
        e.preventDefault();
        markPlanItemDone(done.getAttribute("data-journey-done"));
        return;
      }
      const refresh = e.target.closest?.('[data-journey-action="refresh-plan"]');
      if (refresh) {
        e.preventDefault();
        buildDailyPlan(true);
        renderAllVisible();
        api().showToast?.("Plan refreshed");
        return;
      }
      const revise = e.target.closest?.("[data-journey-revise]");
      if (revise) {
        e.preventDefault();
        const topic = revise.getAttribute("data-journey-revise");
        api().setMainTab?.("flashcards");
        api().showToast?.(`Revise: ${topic}`);
        return;
      }
      const planGo = e.target.closest?.("[data-journey-plan-go]");
      if (planGo) {
        e.preventDefault();
        const tab = planGo.getAttribute("data-tab") || "chat";
        const mode = planGo.getAttribute("data-mode") || "";
        const topic = planGo.getAttribute("data-topic") || "";
        if (mode && typeof api().setLearnStudyMode === "function") api().setLearnStudyMode(mode);
        api().setMainTab?.(tab);
        if (topic && (tab === "chat" || tab === "code")) {
          setTimeout(() => {
            const input = document.getElementById("chatSearchInput") || document.getElementById("codeSearchInput");
            const submit = document.getElementById("chatSearchSubmit") || document.getElementById("codeSearchSubmit");
            if (input && submit) {
              input.value = `Help me with ${topic}`;
              submit.click();
            }
          }, 80);
        }
      }
    });
  }

  function onJourneyTab(tab) {
    if (tab === "progress") renderProgressPanel();
    if (tab === "planner") renderPlannerPanel();
    if (tab === "exam") renderExamPanel();
    if (tab === "diagnostic") renderDiagnosticPanel();
    if (tab === "home") renderHomeJourney();
  }

  function getJourneySnapshot() {
    return {
      ...journey,
      memory: coachMemoryPayload(),
      mastery: overallMastery(),
    };
  }

  function applyJourneySnapshot(payload) {
    if (!payload || typeof payload !== "object") return;
    journey = { ...defaultJourney(), ...payload };
    saveJourney();
  }

  // Public API for app.js
  window.StudentJourney = {
    renderHome: renderHomeJourney,
    onTab: onJourneyTab,
    getCoachMemory: coachMemoryPayload,
    recordLearningEvent,
    getSnapshot: getJourneySnapshot,
    applySnapshot: applyJourneySnapshot,
    applyServerInsights,
    maybeShowOnboarding,
    buildDailyPlan,
    overallMastery,
  };

  function boot() {
    wireJourneyUi();
    buildDailyPlan();
    renderHomeJourney();
    // Delay onboarding so auth/workspace can settle
    setTimeout(() => maybeShowOnboarding(), 1200);
    setTimeout(async () => {
      if (window.StudentAnalytics?.fetchInsights) {
        const insights = await window.StudentAnalytics.fetchInsights(true);
        applyServerInsights(insights);
      }
    }, 1800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
