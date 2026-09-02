import { fail, id } from "./util.js";

const DEFAULT_CAPS = {
  service: 200,
  legal_country: 300,
  region: 80,
};

export function emptyTenant(tenantId, name) {
  return {
    tenant_id: tenantId,
    name: name || tenantId,
    dimensions: new Map(),
    accounts: new Map(),
    legalEntities: new Map(),
    meters: new Map(),
    events: new Map(),
    facts: new Map(),
    factHead: new Map(),
    rateCards: new Map(),
    contracts: new Map(),
    ratingRuns: new Map(),
    invoices: new Map(),
    creditMemos: new Map(),
    invoiceSeq: 0,
    audit: [],
  };
}

export function audit(tenant, action, detail) {
  tenant.audit.push({ at: new Date().toISOString(), action, detail });
}

export function registerDimension(tenant, body) {
  const key = String(body?.key || "").trim();
  if (!key) fail(400, "invalid_dimension", "key is required");
  const cap = Number(body.cardinality_cap ?? DEFAULT_CAPS[key] ?? 50);
  if (!Number.isFinite(cap) || cap < 1) fail(400, "invalid_dimension", "cardinality_cap must be >= 1");
  tenant.dimensions.set(key, { key, cardinality_cap: cap, values: new Set() });
  audit(tenant, "dimension.register", { key, cardinality_cap: cap });
  return { key, cardinality_cap: cap };
}

export function createAccount(tenant, body) {
  const account_id = String(body?.account_id || "").trim();
  const name = String(body?.name || account_id).trim();
  if (!account_id) fail(400, "invalid_account", "account_id is required");
  if (tenant.accounts.has(account_id)) fail(409, "account_exists", "account_id already exists");
  const account = { account_id, name };
  tenant.accounts.set(account_id, account);
  audit(tenant, "account.create", { account_id });
  return account;
}

export function createLegalEntity(tenant, body) {
  const legal_entity_id = String(body?.legal_entity_id || "").trim();
  const account_id = String(body?.account_id || "").trim();
  const legal_country = String(body?.legal_country || "").trim().toUpperCase();
  const currency = String(body?.currency || "").trim().toUpperCase();
  if (!legal_entity_id || !account_id || !/^[A-Z]{2}$/.test(legal_country) || !/^[A-Z]{3}$/.test(currency)) {
    fail(400, "invalid_legal_entity", "legal_entity_id, account_id, legal_country (ISO-2), currency (ISO-3) required");
  }
  if (!tenant.accounts.has(account_id)) fail(404, "account_not_found", "account_id not found");
  if (tenant.legalEntities.has(legal_entity_id)) fail(409, "legal_entity_exists", "legal_entity_id already exists");
  const entity = { legal_entity_id, account_id, legal_country, currency };
  tenant.legalEntities.set(legal_entity_id, entity);
  audit(tenant, "legal_entity.create", { legal_entity_id, legal_country });
  return entity;
}

export function resolveLegalEntity(tenant, accountId, legalEntityId, dimensions = {}) {
  if (legalEntityId) {
    const entity = tenant.legalEntities.get(legalEntityId);
    if (!entity) fail(400, "legal_entity_not_found", "legal_entity_id not found");
    if (entity.account_id !== accountId) fail(400, "legal_entity_mismatch", "legal_entity_id does not belong to account");
    return entity;
  }
  const country = String(dimensions.legal_country || "").toUpperCase();
  const matches = [...tenant.legalEntities.values()].filter(
    (row) => row.account_id === accountId && row.legal_country === country
  );
  if (matches.length === 1) return matches[0];
  fail(400, "legal_entity_required", "legal_entity_id or a unique dimensions.legal_country is required");
}

export function noteDimensionValue(tenant, key, value) {
  const dim = tenant.dimensions.get(key);
  if (!dim) fail(400, "unregistered_dimension", `dimension ${key} is not registered`);
  if (dim.values.has(value)) return;
  if (dim.values.size >= dim.cardinality_cap) {
    fail(400, "dimension_cardinality", `dimension ${key} exceeds cardinality_cap ${dim.cardinality_cap}`);
  }
  dim.values.add(value);
}

export function bootstrapCoreDimensions(tenant) {
  for (const key of ["service", "legal_country", "region"]) {
    if (!tenant.dimensions.has(key)) registerDimension(tenant, { key, cardinality_cap: DEFAULT_CAPS[key] });
  }
}

export function newTenantId() {
  return id("ten");
}
