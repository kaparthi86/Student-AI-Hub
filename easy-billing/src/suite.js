import http from "node:http";
import { bootstrapCoreDimensions, createAccount, createLegalEntity, emptyTenant, newTenantId, registerDimension } from "./controlPlane.js";
import { closeWindows, createMeter, ingestEvents, listFacts, runAggregation } from "./meter.js";
import { createContract, createRateCard, getRatingRun, runRating } from "./rate.js";
import { collectInvoice, createCreditMemo, draftInvoices, finalizeInvoice } from "./ledger.js";

export function createSuite() {
  const tenants = new Map();

  function tenant(tenantId) {
    const row = tenants.get(tenantId);
    if (!row) {
      const err = new Error("tenant_not_found");
      err.status = 404;
      err.code = "tenant_not_found";
      throw err;
    }
    return row;
  }

  function createTenant(body = {}) {
    const tenant_id = String(body.tenant_id || newTenantId());
    if (tenants.has(tenant_id)) {
      const err = new Error("tenant_exists");
      err.status = 409;
      err.code = "tenant_exists";
      throw err;
    }
    const row = emptyTenant(tenant_id, body.name);
    bootstrapCoreDimensions(row);
    tenants.set(tenant_id, row);
    return { tenant_id, name: row.name };
  }

  const api = {
    createTenant,
    registerDimension: (tid, body) => registerDimension(tenant(tid), body),
    createAccount: (tid, body) => createAccount(tenant(tid), body),
    createLegalEntity: (tid, body) => createLegalEntity(tenant(tid), body),
    createMeter: (tid, body) => createMeter(tenant(tid), body),
    ingestEvents: (tid, body) => ingestEvents(tenant(tid), body),
    runAggregation: (tid, body) => runAggregation(tenant(tid), body),
    closeWindows: (tid, body) => closeWindows(tenant(tid), body),
    listFacts: (tid, query) => listFacts(tenant(tid), query),
    createRateCard: (tid, body) => createRateCard(tenant(tid), body),
    createContract: (tid, body) => createContract(tenant(tid), body),
    runRating: (tid, body) => runRating(tenant(tid), body),
    getRatingRun: (tid, id) => getRatingRun(tenant(tid), id),
    draftInvoices: (tid, body) => draftInvoices(tenant(tid), body),
    finalizeInvoice: (tid, id) => finalizeInvoice(tenant(tid), id),
    collectInvoice: (tid, id, body) => collectInvoice(tenant(tid), id, body),
    createCreditMemo: (tid, body) => createCreditMemo(tenant(tid), body),
  };

  return { tenants, ...api };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createServer(suite = createSuite()) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const method = req.method || "GET";

      if (method === "GET" && path === "/health") {
        return send(res, 200, { ok: true, suite: "easy-billing" });
      }

      if (method === "POST" && path === "/v1/tenants") {
        return send(res, 201, suite.createTenant(await readBody(req)));
      }

      const scoped = path.match(/^\/v1\/tenants\/([^/]+)(?:\/(.*))?$/);
      if (!scoped) return send(res, 404, { error: "not_found" });
      const tenantId = decodeURIComponent(scoped[1]);
      const rest = scoped[2] || "";
      const body = method === "GET" ? {} : await readBody(req);

      if (method === "POST" && rest === "dimensions") return send(res, 201, suite.registerDimension(tenantId, body));
      if (method === "POST" && rest === "accounts") return send(res, 201, suite.createAccount(tenantId, body));
      if (method === "POST" && rest === "legal-entities") return send(res, 201, suite.createLegalEntity(tenantId, body));
      if (method === "POST" && rest === "meters") return send(res, 201, suite.createMeter(tenantId, body));
      if (method === "POST" && rest === "events") {
        if (req.headers["idempotency-key"] && !body.event_id && !body.events) {
          body.event_id = String(req.headers["idempotency-key"]);
        }
        return send(res, 200, suite.ingestEvents(tenantId, body));
      }
      if (method === "POST" && rest === "aggregations/run") return send(res, 200, suite.runAggregation(tenantId, body));
      if (method === "POST" && rest === "aggregations/close") return send(res, 200, suite.closeWindows(tenantId, body));
      if (method === "GET" && rest === "facts") {
        return send(res, 200, {
          facts: suite.listFacts(tenantId, {
            account_id: url.searchParams.get("account_id") || undefined,
            from: url.searchParams.get("from") || undefined,
            to: url.searchParams.get("to") || undefined,
          }),
        });
      }
      if (method === "POST" && rest === "rate-cards") return send(res, 201, suite.createRateCard(tenantId, body));
      if (method === "POST" && rest === "contracts") return send(res, 201, suite.createContract(tenantId, body));
      if (method === "POST" && rest === "rating-runs") return send(res, 201, suite.runRating(tenantId, body));
      if (method === "GET" && rest.startsWith("rating-runs/")) {
        return send(res, 200, suite.getRatingRun(tenantId, rest.slice("rating-runs/".length)));
      }
      if (method === "POST" && rest === "invoices/draft") return send(res, 201, { invoices: suite.draftInvoices(tenantId, body) });
      if (method === "POST" && rest.endsWith("/finalize") && rest.startsWith("invoices/")) {
        const invoiceId = rest.slice("invoices/".length, rest.length - "/finalize".length);
        return send(res, 200, suite.finalizeInvoice(tenantId, invoiceId));
      }
      if (method === "POST" && rest.endsWith("/collect") && rest.startsWith("invoices/")) {
        const invoiceId = rest.slice("invoices/".length, rest.length - "/collect".length);
        return send(res, 200, suite.collectInvoice(tenantId, invoiceId, body));
      }
      if (method === "POST" && rest === "credit-memos") return send(res, 201, suite.createCreditMemo(tenantId, body));

      send(res, 404, { error: "not_found" });
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      send(res, status, { error: err.code || "error", message: err.message });
    }
  });
}

const port = Number(process.env.PORT || 8787);
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Easy Billing suite listening on http://127.0.0.1:${port}`);
  });
}
