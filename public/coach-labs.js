/**
 * P1 learning labs: Voice Tutor, Flashcards, Math & Science, Focus Mode, Knowledge Gaps.
 * Depends on window.StudentCoach helpers exported from app.js.
 */
(function initCoachLabs() {
  const api = () => window.StudentCoach || {};
  const cleanCoachText = (text) => {
    const raw = String(text ?? "");
    if (typeof api().polishText === "function") return api().polishText(raw);
    return raw.replace(/\*\*/g, "").trim();
  };
  const FLASH_KEY = "student_ai_flashcards_v1";
  const FOCUS_KEY = "student_ai_focus_sessions_v1";
  const MASTERY_KEY = "student_ai_topic_mastery_v1";

  const mathHistory = [];
  let voiceRec = null;
  let voiceListening = false;
  let flashDeck = loadFlashDeck();
  let flashIndex = 0;
  let flashShowingBack = false;
  let focusSeconds = 25 * 60;
  let focusRemaining = focusSeconds;
  let focusTimer = null;
  let focusPaused = true;
  let focusMode = "focus";

  function $(id) {
    return document.getElementById(id);
  }

  function loadFlashDeck() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FLASH_KEY) || "null");
      if (parsed && Array.isArray(parsed.cards)) return parsed;
    } catch {
      /* ignore */
    }
    return { topic: "", cards: [] };
  }

  function saveFlashDeck(deck) {
    flashDeck = deck;
    try {
      localStorage.setItem(FLASH_KEY, JSON.stringify(deck));
    } catch {
      /* ignore */
    }
  }

  function dueCards() {
    const now = Date.now();
    return (flashDeck.cards || []).filter((c) => !c.dueAt || c.dueAt <= now);
  }

  function scheduleCard(card, grade) {
    const now = Date.now();
    const ease = Number(card.ease || 2.2);
    let interval = Number(card.intervalDays || 0);
    if (grade === "need") {
      interval = 0;
      card.ease = Math.max(1.3, ease - 0.2);
      card.dueAt = now + 10 * 60 * 1000;
    } else if (grade === "almost") {
      interval = Math.max(1, Math.round(interval * 1.2) || 1);
      card.ease = Math.max(1.3, ease - 0.05);
      card.dueAt = now + interval * 24 * 60 * 60 * 1000;
    } else {
      interval = interval ? Math.round(interval * ease) : 1;
      card.ease = Math.min(3.2, ease + 0.05);
      card.dueAt = now + interval * 24 * 60 * 60 * 1000;
    }
    card.intervalDays = interval;
    card.reps = (card.reps || 0) + 1;
    bumpMastery(flashDeck.topic || "General", grade);
  }

  function bumpMastery(topic, grade) {
    if (!topic) return;
    let map = {};
    try {
      map = JSON.parse(localStorage.getItem(MASTERY_KEY) || "{}") || {};
    } catch {
      map = {};
    }
    const row = map[topic] || { know: 0, almost: 0, need: 0 };
    if (grade === "know") row.know += 1;
    else if (grade === "almost") row.almost += 1;
    else row.need += 1;
    map[topic] = row;
    try {
      localStorage.setItem(MASTERY_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  function renderFlashCard() {
    const review = $("flashReview");
    const textEl = $("flashCardText");
    const sideEl = $("flashCardSide");
    const progress = $("flashProgress");
    const due = dueCards();
    if (!due.length) {
      review?.classList.add("hidden");
      if ($("flashStatus")) {
        $("flashStatus").textContent = flashDeck.cards?.length
          ? "No cards due right now. Generate more or come back later."
          : "Generate a deck to start reviewing.";
      }
      return;
    }
    if (flashIndex >= due.length) flashIndex = 0;
    const card = due[flashIndex];
    review?.classList.remove("hidden");
    if (sideEl) sideEl.textContent = flashShowingBack ? "Back" : "Front";
    if (textEl) textEl.textContent = cleanCoachText(flashShowingBack ? card.back : card.front);
    if (progress) progress.textContent = `Card ${flashIndex + 1} of ${due.length} due · deck ${flashDeck.cards.length}`;
  }

  async function generateFlashcards(topic, sourceText) {
    const status = $("flashStatus");
    if (status) status.textContent = "Building flashcards…";
    try {
      const res = await api().fetchAuthed("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          sourceText,
          uiLanguage: api().getUiLanguage?.() || "en",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not generate flashcards.");
      const cards = (data.cards || []).map((c) => ({
        ...c,
        dueAt: Date.now(),
        intervalDays: 0,
        ease: 2.2,
        reps: 0,
      }));
      saveFlashDeck({ topic: data.topic || topic || "Study deck", cards });
      flashIndex = 0;
      flashShowingBack = false;
      if (status) status.textContent = `Ready: ${cards.length} cards on “${flashDeck.topic}”.`;
      renderFlashCard();
    } catch (err) {
      if (status) status.textContent = err.message || "Flashcard generation failed.";
      api().showToast?.(err.message || "Flashcard generation failed.");
    }
  }

  function appendMathBubble(role, text) {
    const thread = $("mathThread");
    if (!thread) return;
    const row = document.createElement("div");
    row.className = `msg ${role === "assistant" ? "assistant" : "user"}`;
    const body = document.createElement("div");
    body.className = "msg-body";
    body.textContent = role === "assistant" ? cleanCoachText(text) : text;
    row.appendChild(body);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
  }

  async function solveMathProblem() {
    const input = $("mathProblemInput");
    const status = $("mathStatus");
    const problem = String(input?.value || "").trim();
    if (!problem) {
      api().showToast?.("Enter a math or science problem first.");
      return;
    }
    if (status) status.textContent = "Working through the steps…";
    appendMathBubble("user", problem);
    mathHistory.push({ role: "user", content: problem });
    if (input) input.value = "";
    try {
      const res = await api().fetchAuthed("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "math",
          message: problem,
          history: mathHistory.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          studyMode: "explain",
          uiLanguage: api().getUiLanguage?.() || "en",
          stream: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Math help failed.");
      const output = String(data.output || "").trim() || "No solution returned.";
      mathHistory.push({ role: "assistant", content: output });
      appendMathBubble("assistant", output);
      if (status) status.textContent = "";
    } catch (err) {
      if (status) status.textContent = err.message || "Math help failed.";
      api().showToast?.(err.message || "Math help failed.");
    }
  }

  function focusTodayCount() {
    try {
      const rows = JSON.parse(localStorage.getItem(FOCUS_KEY) || "[]");
      const day = new Date().toISOString().slice(0, 10);
      return rows.filter((r) => r.day === day).length;
    } catch {
      return 0;
    }
  }

  function recordFocusSession() {
    const task = String($("focusTaskInput")?.value || "").trim() || "Focus block";
    let rows = [];
    try {
      rows = JSON.parse(localStorage.getItem(FOCUS_KEY) || "[]");
    } catch {
      rows = [];
    }
    rows.push({ day: new Date().toISOString().slice(0, 10), task, at: Date.now(), kind: focusMode });
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify(rows.slice(-100)));
    } catch {
      /* ignore */
    }
    updateFocusStatus();
  }

  function formatFocus(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateFocusDisplay() {
    const el = $("focusTimerDisplay");
    if (el) el.textContent = formatFocus(focusRemaining);
  }

  function updateFocusStatus() {
    const el = $("focusStatus");
    if (!el) return;
    el.textContent = `Sessions completed today: ${focusTodayCount()}${
      focusMode === "break" ? " · Break time" : " · Focus block"
    }`;
  }

  function tickFocus() {
    if (focusPaused) return;
    focusRemaining -= 1;
    if (focusRemaining <= 0) {
      focusPaused = true;
      clearInterval(focusTimer);
      focusTimer = null;
      if (focusMode === "focus") {
        recordFocusSession();
        api().showToast?.("Focus block complete. Take a 5-minute break.");
        focusMode = "break";
        focusRemaining = 5 * 60;
      } else {
        api().showToast?.("Break over. Ready for another focus block?");
        focusMode = "focus";
        focusRemaining = 25 * 60;
      }
      updateFocusStatus();
    }
    updateFocusDisplay();
  }

  function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      api().showToast?.("Voice input is not supported in this browser.");
      return;
    }
    if (voiceListening) {
      try {
        voiceRec?.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    voiceRec = new SpeechRecognition();
    voiceRec.continuous = true;
    voiceRec.interimResults = true;
    voiceRec.lang = document.documentElement.lang || "en-US";
    let finalText = "";
    const transcript = $("voiceTutorTranscript");
    const mic = $("voiceTutorMicBtn");
    voiceListening = true;
    mic?.setAttribute("aria-pressed", "true");
    mic?.classList.add("is-listening");
    if ($("voiceTutorHint")) $("voiceTutorHint").textContent = "Listening… tap again when you finish.";

    voiceRec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += `${piece} `;
        else interim += piece;
      }
      if (transcript) {
        transcript.innerHTML = "";
        const you = document.createElement("p");
        you.className = "voice-line voice-line--user";
        you.textContent = `You: ${(finalText + interim).trim() || "…"}`;
        transcript.appendChild(you);
      }
    };

    voiceRec.onerror = () => {
      voiceListening = false;
      mic?.setAttribute("aria-pressed", "false");
      mic?.classList.remove("is-listening");
    };

    voiceRec.onend = async () => {
      voiceListening = false;
      mic?.setAttribute("aria-pressed", "false");
      mic?.classList.remove("is-listening");
      if ($("voiceTutorHint")) $("voiceTutorHint").textContent = "Uses your browser microphone. Works best in Chrome or Edge.";
      const asked = finalText.trim();
      if (!asked) return;
      await askVoiceTutor(asked);
    };

    try {
      voiceRec.start();
    } catch {
      voiceListening = false;
      api().showToast?.("Could not start the microphone.");
    }
  }

  async function askVoiceTutor(question) {
    const transcript = $("voiceTutorTranscript");
    const statusLine = document.createElement("p");
    statusLine.className = "voice-line muted";
    statusLine.textContent = "Coach is thinking…";
    transcript?.appendChild(statusLine);
    try {
      const history = (api().getChatHistory?.() || []).slice(-6).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      }));
      const res = await api().fetchAuthed("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "learn",
          message: question,
          history,
          studyMode: "explain",
          uiLanguage: api().getUiLanguage?.() || "en",
          stream: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Voice tutor failed.");
      const output = String(data.output || "").trim();
      statusLine.remove();
      const coach = document.createElement("p");
      coach.className = "voice-line voice-line--coach";
      coach.textContent = `Coach: ${cleanCoachText(output)}`;
      transcript?.appendChild(coach);
      api().speakText?.(output);
    } catch (err) {
      statusLine.textContent = err.message || "Voice tutor failed.";
      api().showToast?.(err.message || "Voice tutor failed.");
    }
  }

  async function scanKnowledgeGaps() {
    const status = $("gapsStatus");
    const out = $("gapsOutput");
    if (status) status.textContent = "Scanning your recent Ask activity…";
    if (out) out.textContent = "";
    try {
      const history = api().getChatHistory?.() || [];
      const recentSearches = history
        .filter((m) => m?.role === "user")
        .map((m) => String(m.content || "").trim())
        .filter(Boolean)
        .slice(-8);
      const res = await api().fetchAuthed("/api/weak-topic-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "learn", recentSearches, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not analyze weak areas.");
      if (status) status.textContent = "Here is a focused revision plan.";
      if (out) out.textContent = cleanCoachText(String(data.output || "").trim());
    } catch (err) {
      if (status) status.textContent = err.message || "Gap scan failed.";
      api().showToast?.(err.message || "Gap scan failed.");
    }
  }

  function onCoachLabTab(tab) {
    if (tab === "flashcards") renderFlashCard();
    if (tab === "focus") {
      updateFocusDisplay();
      updateFocusStatus();
    }
  }

  function wire() {
    $("voiceTutorMicBtn")?.addEventListener("click", startVoiceRecognition);
    $("voiceTutorStopSpeechBtn")?.addEventListener("click", () => api().stopSpeech?.());
    $("voiceTutorClearBtn")?.addEventListener("click", () => {
      const transcript = $("voiceTutorTranscript");
      if (transcript) transcript.replaceChildren();
    });

    $("flashGenerateBtn")?.addEventListener("click", () => {
      const topic = String($("flashTopicInput")?.value || "").trim();
      void generateFlashcards(topic, "");
    });
    $("flashFromAskBtn")?.addEventListener("click", () => {
      const topic = api().lastAskTopic?.() || "Recent Ask topics";
      const sourceText = (api().getChatHistory?.() || [])
        .slice(-8)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      if ($("flashTopicInput")) $("flashTopicInput").value = topic;
      void generateFlashcards(topic, sourceText);
    });
    $("flashFlipBtn")?.addEventListener("click", () => {
      flashShowingBack = !flashShowingBack;
      renderFlashCard();
    });
    const grade = (kind) => {
      const due = dueCards();
      const card = due[flashIndex];
      if (!card) return;
      scheduleCard(card, kind);
      saveFlashDeck(flashDeck);
      flashShowingBack = false;
      flashIndex += 1;
      renderFlashCard();
    };
    $("flashKnowBtn")?.addEventListener("click", () => grade("know"));
    $("flashAlmostBtn")?.addEventListener("click", () => grade("almost"));
    $("flashNeedBtn")?.addEventListener("click", () => grade("need"));

    $("mathSolveBtn")?.addEventListener("click", () => void solveMathProblem());
    $("mathClearBtn")?.addEventListener("click", () => {
      if ($("mathProblemInput")) $("mathProblemInput").value = "";
      if ($("mathThread")) $("mathThread").replaceChildren();
      mathHistory.length = 0;
      if ($("mathStatus")) $("mathStatus").textContent = "";
    });

    $("focusStartBtn")?.addEventListener("click", () => {
      focusPaused = false;
      if (!focusTimer) focusTimer = setInterval(tickFocus, 1000);
      updateFocusStatus();
    });
    $("focusPauseBtn")?.addEventListener("click", () => {
      focusPaused = true;
    });
    $("focusResetBtn")?.addEventListener("click", () => {
      focusPaused = true;
      clearInterval(focusTimer);
      focusTimer = null;
      focusMode = "focus";
      focusRemaining = 25 * 60;
      updateFocusDisplay();
      updateFocusStatus();
    });

    $("gapsScanBtn")?.addEventListener("click", () => void scanKnowledgeGaps());
    $("gapsPracticeBtn")?.addEventListener("click", () => api().setMainTab?.("chat"));

    window.onCoachLabTab = onCoachLabTab;
    updateFocusDisplay();
    updateFocusStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
