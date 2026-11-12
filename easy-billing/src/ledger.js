import { addDec, formatDec, parseDec } from "./money.js";
import { getRatingRun } from "./rate.js";
import { fail, id } from "./util.js";

function entityOf(tenant, legalEntityId) {
  const entity = tenant.legalEntities.get(legalEntityId);
  if (!entity) fail(400, "legal_entity_not_found", "legal_entity_id on rating line is unknown");
  return entity;
}

export function draftInvoices(tenant, body) {
  const run = getRatingRun(tenant, String(body?.rating_run_id || ""));
  if (run.status !== "frozen") fail(400, "rating_not_frozen", "Ledger can only bill a frozen rating run");
  const existing = [...tenant.invoices.values()].filter((inv) => inv.rating_run_id === run.rating_run_id);
  if (existing.length) return existing;

  const byEntity = new Map();
  for (const line of run.lines) {
    if (!line.legal_entity_id) continue;
    const list = byEntity.get(line.legal_entity_id) || [];
    list.push(line);
    byEntity.set(line.legal_entity_id, list);
  }
  const invoices = [];
  for (const [legal_entity_id, lines] of byEntity) {
    const entity = entityOf(tenant, legal_entity_id);
    if (entity.currency !== run.currency) {
      fail(400, "currency_mismatch", "legal entity currency does not match rate card (no FX in v1)");
    }
    const total = lines.reduce((sum, line) => addDec(sum, parseDec(line.amount)), 0n);
    const invoice = {
      schema_version: "1.0",
      invoice_id: id("inv"),
      invoice_number: null,
      tenant_id: tenant.tenant_id,
      account_id: run.account_id,
      legal_entity_id,
      legal_country: entity.legal_country,
      currency: entity.currency,
      status: "draft",
      rating_run_id: run.rating_run_id,
      lines,
      total_amount: formatDec(total),
      collection: null,
    };
    tenant.invoices.set(invoice.invoice_id, invoice);
    invoices.push(invoice);
  }
  return invoices;
}

export function finalizeInvoice(tenant, invoiceId) {
  const invoice = tenant.invoices.get(invoiceId);
  if (!invoice) fail(404, "invoice_not_found", "invoice_id not found");
  if (invoice.status === "final") return invoice;
  if (invoice.status !== "draft") fail(400, "invoice_not_draft", "only draft invoices can be finalized");
  tenant.invoiceSeq += 1;
  invoice.status = "final";
  invoice.invoice_number = `EB-${invoice.legal_country}-${String(tenant.invoiceSeq).padStart(6, "0")}`;
  return invoice;
}

export function collectInvoice(tenant, invoiceId, body) {
  const invoice = tenant.invoices.get(invoiceId);
  if (!invoice) fail(404, "invoice_not_found", "invoice_id not found");
  if (invoice.status !== "final") fail(400, "invoice_not_final", "collect requires a final invoice");
  const provider = String(body?.provider || "stripe");
  if (provider !== "stripe") fail(400, "unsupported_provider", "v1 collection adapter is stripe");
  invoice.collection = {
    provider: "stripe",
    status: "stubbed",
    external_id: null,
  };
  return invoice;
}

export function createCreditMemo(tenant, body) {
  const invoice = tenant.invoices.get(String(body?.invoice_id || ""));
  if (!invoice) fail(404, "invoice_not_found", "invoice_id not found");
  if (invoice.status !== "final") fail(400, "invoice_not_final", "credit memos require a final invoice");
  const amount = parseDec(body.amount);
  if (amount >= 0n) fail(400, "invalid_credit", "amount must be a negative decimal string");
  const memo = {
    credit_memo_id: id("cm"),
    tenant_id: tenant.tenant_id,
    references_invoice_id: invoice.invoice_id,
    legal_entity_id: invoice.legal_entity_id,
    currency: invoice.currency,
    amount: formatDec(amount),
    reason: String(body.reason || "adjustment"),
    status: "final",
  };
  tenant.creditMemos.set(memo.credit_memo_id, memo);
  return memo;
}
