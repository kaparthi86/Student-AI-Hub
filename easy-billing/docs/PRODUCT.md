# Easy Billing — product boundaries

Three products, one suite. Easy Billing is the **control plane + contract**, not a shared database.

## Why three products

Large scalers split this work already:

- Data/platform owns **what happened** (usage).
- Commercial/finance owns **what it costs** (price).
- Finance/legal owns **what we billed** (invoice).

If those drift under late events or a mid-period contract amendment, invoices become unauditable. Each product is a system of record with its own SLA. The suite is the promise they stay in sync.

```
usage systems  →  Easy Meter  →  billable facts
                      ↓
                 Easy Rate    →  rating results (frozen)
                      ↓
                 Easy Ledger  →  invoice + tax/payment adapters
```

Replay is the product: same facts + same rate-card version = same money.

## Easy Meter

**Owns:** event ingest, meters, registered dimensions, aggregation, watermarks, billable facts, adjustments.

**Does not own:** unit prices, contracts, tax, invoices, collections.

**Accepts**

- Usage events (`schemas/usage-event.schema.json`) with `event_id` as the idempotency key.
- Meter definitions: unit, aggregation (`sum` in v1), allowlisted dimensions, cardinality caps.
- Aggregation runs for a time window (`as_of`).
- Period close for a window end.

**Emits**

- Billable facts (`schemas/billable-fact.schema.json`).
- Facts are **immutable**. A late event after close emits a new fact (`revision > 1`, `supersedes_fact_id`) rather than updating the billed row.

**Large-scaler rules**

- Dimensions are registered per tenant, then attached to a meter. Unregistered keys go to `metadata` and never GROUP BY.
- Cardinality caps reject ingest that would explode a dimension (for example `request_id` as a billable key).
- Legal country is not a tag you hope is present. Events must resolve to `legal_entity_id`.
- Rate against daily (v1) facts, never the raw firehose.

## Easy Rate

**Owns:** list rate cards, contract overlays, simulation, rating runs.

**Does not own:** raw events, tax filing, invoice numbers, collections.

**Accepts**

- Rate cards: per-unit, volume, or tiered rules, matched on a subset of fact dimensions.
- Contracts: account + legal entity overlay, `effective_at` / `end_at`, committed minimums, prepaid credits (v1: overlay unit price + optional minimum).
- Rating request: tenant, account, window, optional `contract_id`. Uses the latest **closed** facts in range unless `simulate=true`.

**Emits**

- Rating result (`schemas/rating-result.schema.json`) with `rating_run_id`.
- A **frozen** run pins `rate_card_version`, `contract_version`, and the fact ids + quantities used. Ledger may only bill a frozen run.

**Large-scaler rules**

- List price is the default. Enterprise deals are versioned overlays, not forks of the catalog.
- Mid-period amendments re-rate from `effective_at`. They do not rewrite a frozen run.
- Simulate before charge: “what would this contract cost on these facts?”

## Easy Ledger

**Owns:** draft and final invoices, credit/debit memos, collection adapter calls.

**Does not own:** aggregation logic, price formulas, tax calculation (calls out), payment processing (calls out).

**Accepts**

- `rating_run_id` (must be frozen) to open drafts — **one invoice per `legal_entity_id`**.
- Finalize (assigns invoice number, immutable thereafter).
- Credit memo against a final invoice (late usage, disputes).
- Collect: adapter name (`stripe` in v1 is a stub).

**Emits**

- Invoice (`schemas/invoice.schema.json`) as a legal artifact.
- Credit memos. Final invoices are never edited in place.

**Large-scaler rules**

- Meter may be regional. The invoice is per legal entity / legal country.
- After period close, money movement is adjustment + memo, not a silent rewrite.
- Tax and payments are adapters. Ledger is the system of record for *usage money*, not the bank.

## Control plane (suite, not a fourth product)

Tenant, users (later), dimension registry, audit of config changes, API keys (later). Config lives here. Data gravity stays in Meter / Rate / Ledger.

## Integration contract

No shared tables. Payloads only:

| Edge | Payload |
|---|---|
| Meter → Rate | Billable fact |
| Rate → Ledger | Frozen rating result (lines + run id) |
| Ledger → Stripe/tax/ERP | Final invoice / credit memo |

If Meter is late after Ledger finalized: Meter emits an adjustment fact → Rate produces a new run (or delta run) → Ledger a credit or debit memo.

## Packaging

Sell the suite; ship Meter independently. Rate is the commercial brain. Ledger is optional if the customer already has Zuora/SAP — offer an adapter, not a conversion.