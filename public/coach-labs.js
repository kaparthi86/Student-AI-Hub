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
  let voiceSpeaking = false;
  let voiceThinking = false;
  let voicePaused = false;
  let voiceAbort = null;
  let voiceHistory = [];
  let voiceSpeakQueue = [];
  let voiceSpeakActive = false;
  let voiceSpeakOnIdle = null;
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

  function setVoiceHint(text) {
    if ($("voiceTutorHint")) $("voiceTutorHint").textContent = text;
  }

  function setVoiceMicState(state) {
    const mic = $("voiceTutorMicBtn");
    if (!mic) return;
    mic.classList.remove("is-listening", "is-speaking", "is-thinking");
    mic.setAttribute("aria-pressed", state === "listening" ? "true" : "false");
    if (state === "listening") {
      mic.classList.add("is-listening");
      mic.textContent = "Listening… tap to send";
    } else if (state === "thinking") {
      mic.classList.add("is-thinking");
      mic.textContent = "Thinking…";
    } else if (state === "speaking") {
      mic.classList.add("is-speaking");
      mic.textContent = "Tap to interrupt";
    } else {
      mic.textContent = "Tap to talk";
    }
  }

  function autoContinueEnabled() {
    return $("voiceAutoContinue")?.checked !== false;
  }

  function appendVoiceLine(role, text, { replaceEl } = {}) {
    const transcript = $("voiceTutorTranscript");
    if (!transcript) return null;
    if (replaceEl && replaceEl.isConnected) {
      replaceEl.textContent = `${role === "user" ? "You" : "Coach"}: ${text}`;
      return replaceEl;
    }
    const line = document.createElement("p");
    line.className = `voice-line voice-line--${role === "user" ? "user" : "coach"}`;
    line.textContent = `${role === "user" ? "You" : "Coach"}: ${text}`;
    transcript.appendChild(line);
    transcript.scrollTop = transcript.scrollHeight;
    return line;
  }

  function stopVoiceRecognition({ silent } = {}) {
    voiceListening = false;
    try {
      voiceRec?.stop();
    } catch {
      /* ignore */
    }
    voiceRec = null;
    if (!silent && !voiceThinking && !voiceSpeaking) setVoiceMicState("idle");
  }

  function stopVoiceSpeech() {
    voiceSpeakQueue = [];
    voiceSpeakActive = false;
    voiceSpeaking = false;
    voiceSpeakOnIdle = null;
    api().stopSpeech?.();
  }

  function pauseVoiceConversation() {
    voicePaused = true;
    voiceAbort?.abort();
    voiceAbort = null;
    stopVoiceRecognition({ silent: true });
    stopVoiceSpeech();
    voiceThinking = false;
    setVoiceMicState("idle");
    setVoiceHint("Paused. Tap the mic when you want to continue.");
  }

  function speakVoiceChunks(chunks, onDone) {
    const list = (Array.isArray(chunks) ? chunks : [chunks]).map((c) => String(c || "").trim()).filter(Boolean);
    if (typeof onDone === "function") voiceSpeakOnIdle = onDone;
    if (list.length) voiceSpeakQueue.push(...list);
    const pump = () => {
      if (voicePaused) {
        voiceSpeakActive = false;
        voiceSpeaking = false;
        voiceSpeakOnIdle = null;
        return;
      }
      if (!voiceSpeakQueue.length) {
        voiceSpeakActive = false;
        voiceSpeaking = false;
        setVoiceMicState("idle");
        const done = voiceSpeakOnIdle;
        voiceSpeakOnIdle = null;
        if (typeof done === "function") done();
        return;
      }
      voiceSpeakActive = true;
      voiceSpeaking = true;
      setVoiceMicState("speaking");
      const next = voiceSpeakQueue.shift();
      const speak = api().speakText;
      if (typeof speak !== "function") {
        voiceSpeakQueue = [];
        voiceSpeakActive = false;
        voiceSpeaking = false;
        const done = voiceSpeakOnIdle;
        voiceSpeakOnIdle = null;
        if (typeof done === "function") done();
        return;
      }
      speak(next, {
        maxChars: 420,
        lang: api().getVoiceLocale?.() || undefined,
        onDone: () => setTimeout(pump, 100),
      });
    };
    if (!voiceSpeakActive) pump();
  }

  function extractSpeakableSentences(buffer, fromIdx) {
    const src = String(buffer || "");
    const slice = src.slice(fromIdx);
    const sentences = [];
    let consumed = 0;
    const re = /[.!?…](\s+|$)/g;
    let m;
    while ((m = re.exec(slice))) {
      const end = m.index + 1;
      const piece = slice.slice(consumed, end).trim();
      if (piece) sentences.push(piece);
      consumed = end;
      // Keep going; spoken cadence prefers short chunks.
      if (sentences.join(" ").length > 220) break;
    }
    return { sentences, nextIdx: fromIdx + consumed };
  }

  function startVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      api().showToast?.("Voice input is not supported in this browser.");
      return;
    }

    // Barge-in while coach is speaking / thinking.
    if (voiceSpeaking || voiceThinking) {
      voicePaused = false;
      voiceAbort?.abort();
      voiceAbort = null;
      stopVoiceSpeech();
      voiceThinking = false;
      // Fall through into a fresh listen turn.
    } else if (voiceListening) {
      // Tap while listening = finish this utterance and send.
      try {
        voiceRec?.stop();
      } catch {
        /* ignore */
      }
      return;
    }

    voicePaused = false;
    stopVoiceSpeech();
    voiceRec = new SpeechRecognition();
    voiceRec.continuous = true;
    voiceRec.interimResults = true;
    const voiceLocale = api().getVoiceLocale?.() || document.documentElement.lang || "en-US";
    voiceRec.lang = voiceLocale;
    let finalText = "";
    let liveLine = null;
    voiceListening = true;
    setVoiceMicState("listening");
    setVoiceHint("Listening… tap again when you finish speaking.");

    voiceRec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += `${piece} `;
        else interim += piece;
      }
      const shown = `${finalText}${interim}`.trim() || "…";
      liveLine = appendVoiceLine("user", shown, { replaceEl: liveLine });
    };

    voiceRec.onerror = () => {
      voiceListening = false;
      if (!voiceThinking && !voiceSpeaking) setVoiceMicState("idle");
    };

    voiceRec.onend = () => {
      voiceListening = false;
      const asked = finalText.trim();
      if (!asked) {
        if (!voiceThinking && !voiceSpeaking) {
          setVoiceMicState("idle");
          setVoiceHint("Tap the mic and ask anything about what you’re studying.");
        }
        return;
      }
      if (liveLine) liveLine.textContent = `You: ${asked}`;
      else appendVoiceLine("user", asked);
      void askVoiceTutor(asked);
    };

    try {
      voiceRec.start();
    } catch {
      voiceListening = false;
      setVoiceMicState("idle");
      api().showToast?.("Could not start the microphone.");
    }
  }

  async function consumeVoiceSse(response, onDelta) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let lineBuf = "";
    let full = "";
    const handlePayload = (json) => {
      if (!json || typeof json !== "object") return;
      if (json.studentAiMeta) return;
      const choice = Array.isArray(json.choices) ? json.choices[0] : null;
      const delta = choice?.delta?.content ?? choice?.message?.content ?? json.content ?? "";
      if (typeof delta === "string" && delta) {
        full += delta;
        onDelta(full);
      } else if (typeof choice?.text === "string" && choice.text) {
        full = choice.text;
        onDelta(full);
      }
    };
    const consumeLines = () => {
      let nl;
      while ((nl = lineBuf.indexOf("\n")) >= 0) {
        const rawLine = lineBuf.slice(0, nl);
        lineBuf = lineBuf.slice(nl + 1);
        const line = rawLine.replace(/\r$/, "");
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).replace(/^\s*/, "");
        if (!payload || payload === "[DONE]") continue;
        try {
          handlePayload(JSON.parse(payload));
        } catch {
          /* ignore partial json */
        }
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuf += decoder.decode(value, { stream: true });
      consumeLines();
    }
    lineBuf += decoder.decode();
    consumeLines();
    return full;
  }

  async function askVoiceTutor(question) {
    const asked = String(question || "").trim();
    if (!asked) return;

    voiceHistory.push({ role: "user", content: asked });
    voiceThinking = true;
    voicePaused = false;
    setVoiceMicState("thinking");
    setVoiceHint("Coach is answering… you can tap to interrupt.");

    const coachLine = appendVoiceLine("coach", "…");
    let spokenIdx = 0;
    let startedSpeech = false;
    const maybeSpeakNewSentences = (fullText) => {
      const cleaned = cleanCoachText(fullText);
      if (coachLine) coachLine.textContent = `Coach: ${cleaned || "…"}`;
      const { sentences, nextIdx } = extractSpeakableSentences(cleaned, spokenIdx);
      if (!sentences.length) return;
      spokenIdx = nextIdx;
      startedSpeech = true;
      speakVoiceChunks(sentences);
    };

    voiceAbort?.abort();
    voiceAbort = new AbortController();
    try {
      const prior = voiceHistory.slice(0, -1).slice(-8);
      const seedHistory = prior.length
        ? prior
        : (api().getChatHistory?.() || []).slice(-4).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || ""),
          }));
      const res = await api().fetchAuthed("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "learn",
          message: asked,
          history: seedHistory,
          studyMode: "explain",
          uiLanguage: api().getReplyLanguage?.() || api().getUiLanguage?.() || "en",
          learnerProfile: api().getLearnerProfile?.() || undefined,
          voiceMode: true,
          voiceLocale: api().getVoiceLocale?.() || undefined,
          stream: true,
        }),
        signal: voiceAbort.signal,
      });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Voice tutor failed.");
      }

      let output = "";
      if (res.body && ct.includes("text/event-stream")) {
        output = await consumeVoiceSse(res, (full) => maybeSpeakNewSentences(full));
      } else {
        const data = await res.json().catch(() => ({}));
        output = String(data.output || "").trim();
        maybeSpeakNewSentences(output);
      }

      const cleaned = cleanCoachText(output) || "I couldn’t form an answer. Try asking again.";
      if (coachLine) coachLine.textContent = `Coach: ${cleaned}`;
      voiceHistory.push({ role: "assistant", content: cleaned });
      voiceThinking = false;

      // Speak any leftover tail that never hit a sentence boundary (capped).
      const remainder = cleaned.slice(spokenIdx).trim();
      const finishAndMaybeContinue = () => {
        voiceSpeaking = false;
        setVoiceMicState("idle");
        if (voicePaused) return;
        if (autoContinueEnabled()) {
          setVoiceHint("Your turn — ask a follow-up. Listening again…");
          setTimeout(() => {
            if (!voicePaused && !voiceListening && !voiceThinking) startVoiceRecognition();
          }, 280);
        } else {
          setVoiceHint("Tap the mic to continue the conversation.");
        }
      };

      if (remainder) {
        const clipped = remainder.length > 280 ? `${remainder.slice(0, 280).trim()}…` : remainder;
        speakVoiceChunks([clipped], finishAndMaybeContinue);
      } else if (startedSpeech || voiceSpeakActive || voiceSpeakQueue.length) {
        // Wait for queued speech to drain.
        speakVoiceChunks([], finishAndMaybeContinue);
      } else if (cleaned) {
        speakVoiceChunks([cleaned.slice(0, 320)], finishAndMaybeContinue);
      } else {
        finishAndMaybeContinue();
      }
    } catch (err) {
      voiceThinking = false;
      if (err && (err.name === "AbortError" || /aborted/i.test(String(err.message || "")))) {
        if (coachLine) coachLine.textContent = "Coach: (interrupted)";
        setVoiceMicState("idle");
        setVoiceHint("Interrupted. Tap the mic to ask a follow-up.");
        return;
      }
      if (coachLine) coachLine.textContent = `Coach: ${err.message || "Voice tutor failed."}`;
      setVoiceMicState("idle");
      setVoiceHint("Something went wrong. Tap the mic to try again.");
      api().showToast?.(err.message || "Voice tutor failed.");
    } finally {
      voiceAbort = null;
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
    if (tab === "voice") {
      const sub = $("voiceTutorSub");
      // Keep conversational framing visible.
      if (sub && !sub.dataset.locked) {
        sub.textContent = "Two-way study talk. Ask, hear the answer, then keep going — interrupt anytime.";
      }
      // Ask host app to refresh region-specific voice hint.
      try {
        window.StudentCoach && document.getElementById("voiceRegionHint");
        const hint = $("voiceRegionHint");
        const locale = api().getVoiceLocale?.();
        if (hint && locale) hint.textContent = `Voice uses your reply language and region (${locale}).`;
      } catch {
        /* ignore */
      }
    }
    if (tab !== "voice") {
      // Leaving voice should not keep the mic hot in the background.
      if (voiceListening || voiceSpeaking || voiceThinking) pauseVoiceConversation();
    }
    if (tab === "flashcards") renderFlashCard();
    if (tab === "focus") {
      updateFocusDisplay();
      updateFocusStatus();
    }
  }

  function wire() {
    $("voiceTutorMicBtn")?.addEventListener("click", startVoiceRecognition);
    $("voiceTutorStopSpeechBtn")?.addEventListener("click", () => pauseVoiceConversation());
    $("voiceTutorClearBtn")?.addEventListener("click", () => {
      pauseVoiceConversation();
      voiceHistory = [];
      const transcript = $("voiceTutorTranscript");
      if (transcript) transcript.replaceChildren();
      setVoiceHint("Conversation cleared. Tap the mic to start again.");
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
