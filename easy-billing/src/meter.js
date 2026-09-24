import { addDec, formatDec, parseDec } from "./money.js";
import { noteDimensionValue, resolveLegalEntity } from "./controlPlane.js";
import { fail, id, iso, utcDayWindow } from "./util.js";

function dimKey(dimensions) {
  return Object.keys(dimensions)
    .sort()
    .map((k) => `${k}=${dimensions[k]}`)
    .join("|");
}

function factGroupKey(accountId, entityId, meterId, windowStart, dimensions) {
  return [accountId, entityId, meterId, windowStart, dimKey(dimensions)].join("::");
}

export function createMeter(tenant, body) {
  const meter_id = String(body?.meter_id || "").trim();
  const name = String(body?.name || meter_id).trim();
  const unit = String(body?.unit || "").trim();
  const aggregation = body?.aggregation || "sum";
  const dimensions = Array.isArray(body?.dimensions) ? body.dimensions.map(String) : [];
  if (!meter_id || !unit) fail(400, "invalid_meter", "meter_id and unit are required");
  if (aggregation !== "sum") fail(400, "invalid_meter", "v1 aggregation is sum only");
  if (!dimensions.length) fail(400, "invalid_meter", "at least one registered dimension is required");
  for (const key of dimensions) {
    if (!tenant.dimensions.has(key)) fail(400, "unregistered_dimension", `dimension ${key} is not registered`);
  }
  if (tenant.meters.has(meter_id)) fail(409, "meter_exists", "meter_id already exists");
  const meter = { meter_id, name, unit, aggregation, dimensions };
  tenant.meters.set(meter_id, meter);
  return meter;
}

function pickDimensions(meter, incoming = {}) {
  const dimensions = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (key.startsWith("meta.")) continue;
    if (!meter.dimensions.includes(key)) {
      fail(400, "unregistered_dimension", `dimension ${key} is not on meter ${meter.meter_id}`);
    }
    dimensions[key] = String(value);
  }
  return dimensions;
}

export function ingestEvents(tenant, payload) {
  const list = Array.isArray(payload?.events) ? payload.events : payload?.event_id ? [payload] : [];
  if (!list.length) fail(400, "invalid_events", "event or events[] is required");
  const accepted = [];
  const duplicates = [];
  for (const raw of list) {
    const event_id = String(raw?.event_id || "").trim();
    if (!event_id) fail(400, "invalid_event", "event_id is required");
    if (tenant.events.has(event_id)) {
      duplicates.push(tenant.events.get(event_id));
      continue;
    }
    const meter = tenant.meters.get(String(raw.meter_id || ""));
    if (!meter) fail(404, "meter_not_found", "meter_id not found");
    const account_id = String(raw.account_id || "").trim();
    if (!tenant.accounts.has(account_id)) fail(404, "account_not_found", "account_id not found");
    const dimensions = pickDimensions(meter, raw.dimensions || {});
    const entity = resolveLegalEntity(tenant, account_id, raw.legal_entity_id, dimensions);
    parseDec(raw.quantity);
    iso(raw.timestamp);
    for (const [key, value] of Object.entries(dimensions)) noteDimensionValue(tenant, key, value);
    const event = {
      schema_version: "1.0",
      event_id,
      account_id,
      legal_entity_id: entity.legal_entity_id,
      meter_id: meter.meter_id,
      timestamp: iso(raw.timestamp),
      quantity: String(raw.quantity),
      dimensions,
      metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
    };
    tenant.events.set(event_id, event);
    accepted.push(event);
  }
  return { accepted: accepted.length, duplicates: duplicates.length, events: [...accepted, ...duplicates] };
}

function headFacts(tenant) {
  return [...tenant.factHead.values()].map((factId) => tenant.facts.get(factId));
}

export function runAggregation(tenant, body) {
  const as_of = iso(body?.as_of || new Date().toISOString());
  const buckets = new Map();
  for (const event of tenant.events.values()) {
    if (new Date(event.timestamp) > new Date(as_of)) continue;
    const window = utcDayWindow(event.timestamp);
    const key = factGroupKey(
      event.account_id,
      event.legal_entity_id,
      event.meter_id,
      window.start,
      event.dimensions
    );
    const cur = buckets.get(key) || { event, window, quantity: 0n };
    cur.quantity = addDec(cur.quantity, parseDec(event.quantity));
    buckets.set(key, cur);
  }

  const upserted = [];
  for (const [key, bucket] of buckets) {
    const meter = tenant.meters.get(bucket.event.meter_id);
    const existingId = tenant.factHead.get(key);
    const existing = existingId ? tenant.facts.get(existingId) : null;
    const qty = formatDec(bucket.quantity);
    if (existing && !existing.closed) {
      existing.quantity = qty;
      existing.watermark = as_of;
      existing.as_of = as_of;
      upserted.push(existing);
      continue;
    }
    if (existing && existing.closed && existing.quantity === qty) {
      existing.watermark = as_of;
      existing.as_of = as_of;
      upserted.push(existing);
      continue;
    }
    const fact = {
      schema_version: "1.0",
      fact_id: id("fact"),
      tenant_id: tenant.tenant_id,
      account_id: bucket.event.account_id,
      legal_entity_id: bucket.event.legal_entity_id,
      meter_id: bucket.event.meter_id,
      window: bucket.window,
      dimensions: bucket.event.dimensions,
      quantity: qty,
      unit: meter.unit,
      aggregation: meter.aggregation,
      watermark: as_of,
      as_of,
      closed: Boolean(existing?.closed),
      revision: existing ? existing.revision + 1 : 1,
      supersedes_fact_id: existing ? existing.fact_id : null,
    };
    tenant.facts.set(fact.fact_id, fact);
    tenant.factHead.set(key, fact.fact_id);
    upserted.push(fact);
  }
  return { as_of, facts: upserted };
}

export function closeWindows(tenant, body) {
  const window_end = iso(body?.window_end);
  let closed = 0;
  for (const fact of headFacts(tenant)) {
    if (new Date(fact.window.end) <= new Date(window_end) && !fact.closed) {
      fact.closed = true;
      closed += 1;
    }
  }
  return { window_end, closed };
}

export function listFacts(tenant, query = {}) {
  const account_id = query.account_id;
  const from = query.from ? iso(query.from) : null;
  const to = query.to ? iso(query.to) : null;
  return headFacts(tenant).filter((fact) => {
    if (account_id && fact.account_id !== account_id) return false;
    if (from && new Date(fact.window.start) < new Date(from)) return false;
    if (to && new Date(fact.window.start) >= new Date(to)) return false;
    return true;
  });
}
