let seq = 0;

export function id(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export function fail(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  throw err;
}

export function utcDayWindow(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) fail(400, "invalid_timestamp", "timestamp must be RFC 3339");
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { grain: "day", start: start.toISOString(), end: end.toISOString() };
}

export function iso(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) fail(400, "invalid_timestamp", "expected RFC 3339 time");
  return d.toISOString();
}

export function cmpIso(a, b) {
  return new Date(a).getTime() - new Date(b).getTime();
}
