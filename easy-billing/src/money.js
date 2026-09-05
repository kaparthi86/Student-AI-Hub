const SCALE = 1_000_000n;

export function parseDec(value) {
  const str = String(value ?? "").trim();
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(str)) {
    const err = new Error("invalid_decimal");
    err.status = 400;
    err.code = "invalid_decimal";
    throw err;
  }
  const neg = str.startsWith("-");
  const raw = neg ? str.slice(1) : str;
  const [whole, frac = ""] = raw.split(".");
  const scaled = BigInt(whole) * SCALE + BigInt((frac + "000000").slice(0, 6));
  return neg ? -scaled : scaled;
}

export function formatDec(scaled) {
  const neg = scaled < 0n;
  const x = neg ? -scaled : scaled;
  const whole = x / SCALE;
  const frac = (x % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : `${whole.toString()}`;
  return neg ? `-${body}` : body;
}

export function addDec(a, b) {
  return a + b;
}

export function mulDec(a, b) {
  return (a * b) / SCALE;
}

export function gte(a, b) {
  return a >= b;
}
