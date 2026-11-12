/**
 * Cost-gated OpenAI Realtime (gpt-realtime-2.1-mini) WebRTC client.
 * Falls back is handled by coach-labs.js when status.enabled is false.
 */
(function initRealtimeVoice() {
  const state = {
    pc: null,
    dc: null,
    localStream: null,
    audioEl: null,
    reservedSeconds: 0,
    startedAt: 0,
    timerId: null,
    active: false,
  };

  function api() {
    return window.StudentCoach || {};
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setHint(text) {
    if ($("voiceTutorHint")) $("voiceTutorHint").textContent = text;
  }

  function setQuotaLabel(status) {
    const el = $("voiceRealtimeQuota");
    if (!el || !status) return;
    if (!status.enabled) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const leftMin = Math.max(0, Math.floor((status.remainingSeconds || 0) / 60));
    const leftSec = Math.max(0, (status.remainingSeconds || 0) % 60);
    el.textContent = `Live OpenAI coach: ${leftMin}m ${String(leftSec).padStart(2, "0")}s left today (cost-capped)`;
  }

  async function fetchStatus() {
    try {
      const res = await api().fetchAuthed?.("/api/realtime/status");
      if (!res) return null;
      const data = await res.json().catch(() => null);
      if (!res.ok) return null;
      setQuotaLabel(data);
      return data;
    } catch {
      return null;
    }
  }

  function appendLine(role, text) {
    const transcript = $("voiceTutorTranscript");
    if (!transcript || !text) return;
    const line = document.createElement("p");
    line.className = `voice-line voice-line--${role === "user" ? "user" : "coach"}`;
    line.textContent = `${role === "user" ? "You" : "Coach"}: ${text}`;
    transcript.appendChild(line);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function clearTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function updateSessionBadge() {
    const badge = $("voiceSessionBadge");
    if (!badge) return;
    if (!state.active) {
      badge.hidden = true;
      return;
    }
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const left = Math.max(0, state.reservedSeconds - elapsed);
    badge.hidden = false;
    badge.textContent = `Live OpenAI · ${left}s left`;
  }

  async function reportUsage() {
    if (!state.reservedSeconds) return;
    const actual = Math.min(
      state.reservedSeconds,
      Math.max(1, Math.ceil((Date.now() - state.startedAt) / 1000)),
    );
    try {
      await api().fetchAuthed?.("/api/realtime/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservedSeconds: state.reservedSeconds,
          actualSeconds: actual,
        }),
      });
    } catch {
      /* ignore */
    }
    state.reservedSeconds = 0;
    void fetchStatus();
  }

  async function stop() {
    clearTimer();
    const wasActive = state.active;
    state.active = false;
    try {
      state.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      state.pc?.getSenders?.().forEach((s) => {
        try {
          s.track?.stop();
        } catch {
          /* ignore */
        }
      });
      state.pc?.close();
    } catch {
      /* ignore */
    }
    try {
      state.localStream?.getTracks?.().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    if (state.audioEl) {
      try {
        state.audioEl.srcObject = null;
        state.audioEl.remove();
      } catch {
        /* ignore */
      }
    }
    state.pc = null;
    state.dc = null;
    state.localStream = null;
    state.audioEl = null;
    if ($("voiceSessionBadge")) $("voiceSessionBadge").hidden = true;
    const mic = $("voiceTutorMicBtn");
    if (mic) {
      mic.classList.remove("is-listening", "is-speaking", "is-thinking");
      mic.textContent = "Start conversation";
      mic.setAttribute("aria-pressed", "false");
    }
    if (wasActive) {
      await reportUsage();
      setHint("Live session ended. You can start again if minutes remain, or switch to Browser coach.");
    }
  }

  function handleDataEvent(raw) {
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    const type = String(event?.type || "");
    if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
      // Streaming coach transcript — optional; full text often arrives at done.
      return;
    }
    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const text = String(event.transcript || event.text || "").trim();
      if (text) appendLine("coach", text);
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const text = String(event.transcript || "").trim();
      if (text) appendLine("user", text);
      return;
    }
    if (type === "error") {
      const msg = event.error?.message || event.message || "Live voice error";
      setHint(String(msg));
      api().showToast?.(String(msg));
    }
  }

  async function start() {
    if (state.active) return;
    setHint("Starting live OpenAI coach…");
    const mic = $("voiceTutorMicBtn");
    if (mic) {
      mic.classList.add("is-thinking");
      mic.textContent = "Connecting…";
    }

    const sessionRes = await api().fetchAuthed?.("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const session = await sessionRes.json().catch(() => ({}));
    if (!sessionRes.ok) {
      throw new Error(session.error || "Could not start live session.");
    }
    const ephemeralKey = session.clientSecret;
    state.reservedSeconds = Number(session.reservedSeconds) || Number(session.maxSessionSeconds) || 480;
    state.startedAt = Date.now();

    const pc = new RTCPeerConnection();
    state.pc = pc;
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "true");
    document.body.appendChild(audioEl);
    state.audioEl = audioEl;
    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
    };

    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.localStream = ms;
    ms.getTracks().forEach((track) => pc.addTrack(track, ms));

    const dc = pc.createDataChannel("oai-events");
    state.dc = dc;
    dc.addEventListener("message", (e) => handleDataEvent(e.data));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!sdpResponse.ok) {
      const errText = await sdpResponse.text().catch(() => "");
      throw new Error(errText || "OpenAI WebRTC handshake failed.");
    }
    const answer = { type: "answer", sdp: await sdpResponse.text() };
    await pc.setRemoteDescription(answer);

    state.active = true;
    if (mic) {
      mic.classList.remove("is-thinking");
      mic.classList.add("is-listening");
      mic.textContent = "Live — tap End session when done";
      mic.setAttribute("aria-pressed", "true");
    }
    setHint("Live conversation on. Speak naturally — interrupt anytime. Minutes are capped for cost control.");
    updateSessionBadge();
    clearTimer();
    state.timerId = setInterval(() => {
      updateSessionBadge();
      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      if (elapsed >= state.reservedSeconds) {
        void stop();
        api().showToast?.("Live session time used for this turn.");
      }
    }, 1000);
    void fetchStatus();
  }

  function isLiveModeSelected() {
    const checked = document.querySelector('input[name="voiceEngine"]:checked');
    return checked?.value === "realtime";
  }

  function isActive() {
    return state.active;
  }

  async function refreshUi() {
    const status = await fetchStatus();
    const wrap = $("voiceEnginePicker");
    const liveOpt = $("voiceEngineRealtime");
    if (wrap) wrap.hidden = false;
    if (liveOpt) {
      const enabled = Boolean(status?.enabled);
      liveOpt.disabled = !enabled;
      if (!enabled && isLiveModeSelected()) {
        const browser = $("voiceEngineBrowser");
        if (browser) browser.checked = true;
      }
    }
    return status;
  }

  window.StudentCoachRealtime = {
    start,
    stop,
    refreshUi,
    fetchStatus,
    isLiveModeSelected,
    isActive,
  };
})();
