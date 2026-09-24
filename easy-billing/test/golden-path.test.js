import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, createSuite } from "../src/suite.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSchema(name) {
  return JSON.parse(readFileSync(join(root, "schemas", name), "utf8"));
}

function setup() {
  const suite = createSuite();
  const { tenant_id } = suite.createTenant({ tenant_id: "acme", name: "Acme Cloud" });
  suite.createAccount(tenant_id, { account_id: "cust_1", name: "Hyper Buyer" });
  suite.createLegalEntity(tenant_id, {
    legal_entity_id: "le_us",
    account_id: "cust_1",
    legal_country: "US",
    currency: "USD",
  });
  suite.createLegalEntity(tenant_id, {
    legal_entity_id: "le_de",
    account_id: "cust_1",
    legal_country: "DE",
    currency: "USD",
  });
  suite.createMeter(tenant_id, {
    meter_id: "gpu_hours",
    name: "GPU hours",
    unit: "gpu_hours",
    aggregation: "sum",
    dimensions: ["service", "legal_country", "region"],
  });
  suite.createRateCard(tenant_id, {
    rate_card_id: "list_gpu",
    currency: "USD",
    rules: [{ rule_id: "gpu_list", meter_id: "gpu_hours", model: "per_unit", unit_price: "2.00" }],
  });
  suite.createContract(tenant_id, {
    contract_id: "con_de",
    account_id: "cust_1",
    legal_entity_id: "le_de",
    rate_card_id: "list_gpu",
    overrides: [{ meter_id: "gpu_hours", unit_price: "1.50" }],
  });
  return { suite, tenant_id };
}

test("schemas declare the three product payloads", () => {
  assert.equal(readSchema("usage-event.schema.json").title, "UsageEvent");
  assert.equal(readSchema("billable-fact.schema.json").title, "BillableFact");
  assert.equal(readSchema("rating-result.schema.json").title, "RatingResult");
  assert.equal(readSchema("invoice.schema.json").title, "Invoice");
});

test("golden path: ingest → facts → rate → invoices per legal entity", () => {
  const { suite, tenant_id } = setup();
  const ingest = suite.ingestEvents(tenant_id, {
    events: [
      {
        event_id: "e1",
        account_id: "cust_1",
        legal_entity_id: "le_us",
        meter_id: "gpu_hours",
        timestamp: "2026-09-01T10:00:00Z",
        quantity: "10",
        dimensions: { service: "gpu.inference", legal_country: "US", region: "us-east-1" },
      },
      {
        event_id: "e2",
        account_id: "cust_1",
        legal_entity_id: "le_de",
        meter_id: "gpu_hours",
        timestamp: "2026-09-01T11:00:00Z",
        quantity: "4",
        dimensions: { service: "gpu.inference", legal_country: "DE", region: "eu-central-1" },
      },
    ],
  });
  assert.equal(ingest.accepted, 2);

  const dup = suite.ingestEvents(tenant_id, ingest.events[0]);
  assert.equal(dup.duplicates, 1);
  assert.equal(dup.accepted, 0);

  const agg = suite.runAggregation(tenant_id, { as_of: "2026-09-01T23:59:59Z" });
  assert.equal(agg.facts.length, 2);
  suite.closeWindows(tenant_id, { window_end: "2026-09-02T00:00:00Z" });
  assert.equal(suite.listFacts(tenant_id).every((f) => f.closed), true);

  const listRun = suite.runRating(tenant_id, {
    account_id: "cust_1",
    rate_card_id: "list_gpu",
    window_start: "2026-09-01T00:00:00Z",
    window_end: "2026-09-02T00:00:00Z",
  });
  assert.equal(listRun.status, "frozen");
  assert.equal(listRun.total_amount, "28");

  const deRun = suite.runRating(tenant_id, {
    account_id: "cust_1",
    contract_id: "con_de",
    window_start: "2026-09-01T00:00:00Z",
    window_end: "2026-09-02T00:00:00Z",
  });
  assert.equal(deRun.total_amount, "6");
  assert.equal(deRun.lines.length, 1);
  assert.equal(deRun.lines[0].unit_price, "1.5");

  const invoices = suite.draftInvoices(tenant_id, { rating_run_id: listRun.rating_run_id });
  assert.equal(invoices.length, 2);
  const countries = invoices.map((inv) => inv.legal_country).sort();
  assert.deepEqual(countries, ["DE", "US"]);
  const us = invoices.find((inv) => inv.legal_country === "US");
  assert.equal(us.total_amount, "20");
  const finalUs = suite.finalizeInvoice(tenant_id, us.invoice_id);
  assert.equal(finalUs.status, "final");
  assert.match(finalUs.invoice_number, /^EB-US-/);
  const collected = suite.collectInvoice(tenant_id, us.invoice_id, { provider: "stripe" });
  assert.equal(collected.collection.status, "stubbed");

  const replay = suite.runRating(tenant_id, {
    account_id: "cust_1",
    rate_card_id: "list_gpu",
    window_start: "2026-09-01T00:00:00Z",
    window_end: "2026-09-02T00:00:00Z",
  });
  assert.equal(replay.total_amount, listRun.total_amount);
  assert.equal(replay.lines.length, listRun.lines.length);
});

test("late event after close creates an adjustment fact, not an in-place edit", () => {
  const { suite, tenant_id } = setup();
  suite.ingestEvents(tenant_id, {
    event_id: "late-1",
    account_id: "cust_1",
    legal_entity_id: "le_us",
    meter_id: "gpu_hours",
    timestamp: "2026-09-01T08:00:00Z",
    quantity: "1",
    dimensions: { service: "gpu.inference", legal_country: "US", region: "us-east-1" },
  });
  suite.runAggregation(tenant_id, { as_of: "2026-09-01T12:00:00Z" });
  suite.closeWindows(tenant_id, { window_end: "2026-09-02T00:00:00Z" });
  const original = suite.listFacts(tenant_id)[0];
  assert.equal(original.revision, 1);
  assert.equal(original.closed, true);

  suite.ingestEvents(tenant_id, {
    event_id: "late-2",
    account_id: "cust_1",
    legal_entity_id: "le_us",
    meter_id: "gpu_hours",
    timestamp: "2026-09-01T18:00:00Z",
    quantity: "3",
    dimensions: { service: "gpu.inference", legal_country: "US", region: "us-east-1" },
  });
  suite.runAggregation(tenant_id, { as_of: "2026-09-03T00:00:00Z" });
  const head = suite.listFacts(tenant_id)[0];
  assert.equal(head.revision, 2);
  assert.equal(head.quantity, "4");
  assert.equal(head.supersedes_fact_id, original.fact_id);
  assert.notEqual(head.fact_id, original.fact_id);
  assert.equal(original.quantity, "1");

  suite.finalizeInvoice(
    tenant_id,
    suite.draftInvoices(tenant_id, {
      rating_run_id: suite.runRating(tenant_id, {
        account_id: "cust_1",
        rate_card_id: "list_gpu",
        window_start: "2026-09-01T00:00:00Z",
        window_end: "2026-09-02T00:00:00Z",
      }).rating_run_id,
    })[0].invoice_id
  );
  const memo = suite.createCreditMemo(tenant_id, {
    invoice_id: [...suite.tenants.get(tenant_id).invoices.values()][0].invoice_id,
    amount: "-2.00",
    reason: "late usage true-up",
  });
  assert.equal(memo.amount, "-2");
});

test("unregistered dimension and cardinality caps reject ingest", () => {
  const { suite, tenant_id } = setup();
  assert.throws(
    () =>
      suite.ingestEvents(tenant_id, {
        event_id: "bad-dim",
        account_id: "cust_1",
        legal_entity_id: "le_us",
        meter_id: "gpu_hours",
        timestamp: "2026-09-01T00:00:00Z",
        quantity: "1",
        dimensions: { service: "gpu.inference", legal_country: "US", region: "us-east-1", request_id: "abc" },
      }),
    (err) => err.code === "unregistered_dimension"
  );
  suite.registerDimension(tenant_id, { key: "sku", cardinality_cap: 1 });
  suite.createMeter(tenant_id, {
    meter_id: "sku_calls",
    unit: "calls",
    dimensions: ["sku"],
  });
  suite.ingestEvents(tenant_id, {
    event_id: "sku-1",
    account_id: "cust_1",
    legal_entity_id: "le_us",
    meter_id: "sku_calls",
    timestamp: "2026-09-01T00:00:00Z",
    quantity: "1",
    dimensions: { sku: "a" },
  });
  assert.throws(
    () =>
      suite.ingestEvents(tenant_id, {
        event_id: "sku-2",
        account_id: "cust_1",
        legal_entity_id: "le_us",
        meter_id: "sku_calls",
        timestamp: "2026-09-01T00:00:00Z",
        quantity: "1",
        dimensions: { sku: "b" },
      }),
    (err) => err.code === "dimension_cardinality"
  );
});

test("HTTP suite health and tenant create", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    const created = await fetch(`http://127.0.0.1:${port}/v1/tenants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: "http1", name: "HTTP" }),
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.tenant_id, "http1");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
