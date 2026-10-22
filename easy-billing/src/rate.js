import { addDec, formatDec, gte, mulDec, parseDec } from "./money.js";
import { listFacts } from "./meter.js";
import { fail, id, iso } from "./util.js";

function matches(ruleMatch = {}, dimensions = {}) {
  return Object.entries(ruleMatch).every(([key, value]) => dimensions[key] === value);
}

export function createRateCard(tenant, body) {
  const rate_card_id = String(body?.rate_card_id || id("rc"));
  const currency = String(body?.currency || "").trim().toUpperCase();
  const rules = Array.isArray(body?.rules) ? body.rules : [];
  if (!/^[A-Z]{3}$/.test(currency)) fail(400, "invalid_rate_card", "currency ISO-3 required");
  if (!rules.length) fail(400, "invalid_rate_card", "at least one rule is required");
  const existing = tenant.rateCards.get(rate_card_id);
  const version = existing ? existing.version + 1 : 1;
  const normalized = rules.map((rule, i) => {
    const model = rule.model || "per_unit";
    if (!["per_unit", "volume", "tiered"].includes(model)) fail(400, "invalid_rule", "model must be per_unit, volume, or tiered");
    const meter_id = String(rule.meter_id || "");
    if (!tenant.meters.has(meter_id)) fail(404, "meter_not_found", "rule meter_id not found");
    const rule_id = String(rule.rule_id || `rule_${i + 1}`);
    return {
      rule_id,
      meter_id,
      model,
      match: rule.match && typeof rule.match === "object" ? rule.match : {},
      unit_price: rule.unit_price != null ? String(rule.unit_price) : null,
      tiers: Array.isArray(rule.tiers) ? rule.tiers : [],
    };
  });
  const card = { rate_card_id, currency, version, rules: normalized };
  tenant.rateCards.set(rate_card_id, card);
  return card;
}

export function createContract(tenant, body) {
  const contract_id = String(body?.contract_id || id("con"));
  const account_id = String(body?.account_id || "");
  const rate_card_id = String(body?.rate_card_id || "");
  if (!tenant.accounts.has(account_id)) fail(404, "account_not_found", "account_id not found");
  if (!tenant.rateCards.has(rate_card_id)) fail(404, "rate_card_not_found", "rate_card_id not found");
  const existing = tenant.contracts.get(contract_id);
  const version = existing ? existing.version + 1 : 1;
  const contract = {
    contract_id,
    account_id,
    legal_entity_id: body.legal_entity_id || null,
    rate_card_id,
    version,
    effective_at: iso(body.effective_at || "1970-01-01T00:00:00Z"),
    end_at: body.end_at ? iso(body.end_at) : null,
    overrides: Array.isArray(body.overrides) ? body.overrides : [],
    minimum_amount: body.minimum_amount != null ? String(body.minimum_amount) : null,
  };
  tenant.contracts.set(contract_id, contract);
  return contract;
}

function pickRule(card, fact) {
  return card.rules.find((rule) => rule.meter_id === fact.meter_id && matches(rule.match, fact.dimensions)) || null;
}

function overlayUnitPrice(contract, rule, unitPrice) {
  if (!contract) return unitPrice;
  const hit = contract.overrides.find((row) => row.rule_id === rule.rule_id || row.meter_id === rule.meter_id);
  if (hit?.unit_price != null) return parseDec(hit.unit_price);
  return unitPrice;
}

function volumePrice(rule, qty) {
  const tiers = [...rule.tiers].sort((a, b) => parseDec(a.up_to || "0") - parseDec(b.up_to || "0"));
  let chosen = rule.unit_price != null ? parseDec(rule.unit_price) : 0n;
  for (const tier of tiers) {
    if (tier.up_to == null || gte(parseDec(tier.up_to), qty)) {
      chosen = parseDec(tier.unit_price);
      break;
    }
    chosen = parseDec(tier.unit_price);
  }
  return chosen;
}

function tieredAmount(rule, qty) {
  const tiers = [...rule.tiers];
  if (!tiers.length) return mulDec(qty, parseDec(rule.unit_price || "0"));
  let remaining = qty;
  let prev = 0n;
  let amount = 0n;
  for (const tier of tiers) {
    const cap = tier.up_to == null ? remaining : parseDec(tier.up_to);
    const span = cap - prev;
    const take = remaining < span ? remaining : span;
    if (take > 0n) amount = addDec(amount, mulDec(take, parseDec(tier.unit_price)));
    remaining -= take;
    prev = cap;
    if (remaining <= 0n) break;
  }
  if (remaining > 0n && rule.unit_price != null) {
    amount = addDec(amount, mulDec(remaining, parseDec(rule.unit_price)));
  }
  return amount;
}

function rateFact(fact, rule, contract) {
  const qty = parseDec(fact.quantity);
  let unitPrice;
  let amount;
  if (rule.model === "tiered") {
    amount = tieredAmount(rule, qty);
    unitPrice = qty === 0n ? 0n : (amount * 1_000_000n) / qty;
  } else if (rule.model === "volume") {
    unitPrice = overlayUnitPrice(contract, rule, volumePrice(rule, qty));
    amount = mulDec(qty, unitPrice);
  } else {
    unitPrice = overlayUnitPrice(contract, rule, parseDec(rule.unit_price || "0"));
    amount = mulDec(qty, unitPrice);
  }
  return {
    line_id: id("line"),
    fact_id: fact.fact_id,
    legal_entity_id: fact.legal_entity_id,
    meter_id: fact.meter_id,
    rule_id: rule.rule_id,
    quantity: fact.quantity,
    unit_price: formatDec(unitPrice),
    amount: formatDec(amount),
    dimensions: fact.dimensions,
    _amount: amount,
  };
}

export function runRating(tenant, body) {
  const account_id = String(body?.account_id || "");
  if (!tenant.accounts.has(account_id)) fail(404, "account_not_found", "account_id not found");
  const window_start = iso(body.window_start);
  const window_end = iso(body.window_end);
  const simulate = Boolean(body.simulate);
  let contract = null;
  if (body.contract_id) {
    contract = tenant.contracts.get(body.contract_id);
    if (!contract) fail(404, "contract_not_found", "contract_id not found");
    if (contract.account_id !== account_id) fail(400, "contract_mismatch", "contract does not belong to account");
  }
  const rate_card_id = contract?.rate_card_id || String(body.rate_card_id || "");
  const card = tenant.rateCards.get(rate_card_id);
  if (!card) fail(404, "rate_card_not_found", "rate_card_id not found");

  const facts = listFacts(tenant, { account_id, from: window_start, to: window_end });
  const lines = [];
  const fact_refs = [];
  let total = 0n;
  for (const fact of facts) {
    if (contract?.legal_entity_id && fact.legal_entity_id !== contract.legal_entity_id) continue;
    const rule = pickRule(card, fact);
    if (!rule) fail(400, "unpriced_fact", `no rate rule for meter ${fact.meter_id}`);
    const line = rateFact(fact, rule, contract);
    total = addDec(total, line._amount);
    fact_refs.push({ fact_id: fact.fact_id, quantity: fact.quantity });
    const { _amount, ...pub } = line;
    void _amount;
    lines.push(pub);
  }

  let minimum_applied = null;
  if (contract?.minimum_amount != null && total < parseDec(contract.minimum_amount)) {
    const bump = parseDec(contract.minimum_amount) - total;
    minimum_applied = formatDec(bump);
    total = parseDec(contract.minimum_amount);
    lines.push({
      line_id: id("line"),
      fact_id: null,
      legal_entity_id: contract.legal_entity_id || lines[0]?.legal_entity_id,
      meter_id: "minimum",
      rule_id: "minimum_amount",
      quantity: "1",
      unit_price: minimum_applied,
      amount: minimum_applied,
      dimensions: {},
    });
  }

  const result = {
    schema_version: "1.0",
    rating_run_id: id("run"),
    tenant_id: tenant.tenant_id,
    account_id,
    contract_id: contract?.contract_id || null,
    contract_version: contract?.version || null,
    status: simulate ? "simulated" : "frozen",
    window: { start: window_start, end: window_end },
    rate_card_id: card.rate_card_id,
    rate_card_version: card.version,
    currency: card.currency,
    fact_refs,
    lines,
    minimum_applied,
    total_amount: formatDec(total),
  };
  tenant.ratingRuns.set(result.rating_run_id, result);
  return result;
}

export function getRatingRun(tenant, ratingRunId) {
  const run = tenant.ratingRuns.get(ratingRunId);
  if (!run) fail(404, "rating_run_not_found", "rating_run_id not found");
  return run;
}
