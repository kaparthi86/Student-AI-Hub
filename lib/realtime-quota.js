/**
 * Cost controls for OpenAI Realtime voice sessions.
 * Tracks per-user daily seconds in a small JSON file (plus in-memory cache).
 */
const fs = require("fs");
const path = require("path");

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // UTC day bucket
}

function createRealtimeQuota({
  filePath,
  dailySeconds = 10 * 60,
  maxSessionSeconds = 8 * 60,
}) {
  const storePath = filePath;
  let cache = { day: dayKey(), users: {} };

  function load() {
    try {
      if (!fs.existsSync(storePath)) return;
      const raw = JSON.parse(fs.readFileSync(storePath, "utf8"));
      if (raw && typeof raw === "object") {
        cache = {
          day: String(raw.day || dayKey()),
          users: raw.users && typeof raw.users === "object" ? raw.users : {},
        };
      }
    } catch {
      /* ignore corrupt file */
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(cache), "utf8");
    } catch {
      /* best-effort */
    }
  }

  function rollDay() {
    const today = dayKey();
    if (cache.day !== today) {
      cache = { day: today, users: {} };
      persist();
    }
  }

  load();
  rollDay();

  function getUsed(userId) {
    rollDay();
    const id = String(userId || "").trim() || "anonymous";
    return Math.max(0, Number(cache.users[id] || 0) || 0);
  }

  function remaining(userId) {
    return Math.max(0, dailySeconds - getUsed(userId));
  }

  function canStart(userId) {
    return remaining(userId) >= 30; // need at least 30s left
  }

  function reserve(userId, seconds) {
    rollDay();
    const id = String(userId || "").trim() || "anonymous";
    const want = Math.max(0, Math.min(maxSessionSeconds, Number(seconds) || 0));
    const left = remaining(id);
    const granted = Math.min(want, left);
    if (granted < 30) {
      return { ok: false, granted: 0, remaining: left };
    }
    cache.users[id] = getUsed(id) + granted;
    persist();
    return { ok: true, granted, remaining: remaining(id) };
  }

  /** Release unused reserved seconds after a session ends. */
  function settle(userId, reservedSeconds, actualSeconds) {
    rollDay();
    const id = String(userId || "").trim() || "anonymous";
    const reserved = Math.max(0, Number(reservedSeconds) || 0);
    const actual = Math.max(0, Math.min(reserved, Number(actualSeconds) || 0));
    const refund = Math.max(0, reserved - actual);
    if (refund > 0) {
      cache.users[id] = Math.max(0, getUsed(id) - refund);
      persist();
    }
    return {
      ok: true,
      charged: actual,
      remaining: remaining(id),
    };
  }

  return {
    dailySeconds,
    maxSessionSeconds,
    getUsed,
    remaining,
    canStart,
    reserve,
    settle,
  };
}

module.exports = { createRealtimeQuota, dayKey };
