# Easy Billing Suite

Meter usage, rate it, then invoice it — as **three products** with one control plane. Built for large cloud scalers: late data, custom contracts, and one legal invoice per country entity.

This folder is a **separate product**. It is not part of Student AI Hub. Extract it to its own repository before production use.

| Product | System of record | Input | Output |
|---|---|---|---|
| **Easy Meter** | Billable facts | Usage events | Windowed quantities |
| **Easy Rate** | Rating runs | Facts + rate card + contract | Frozen money lines |
| **Easy Ledger** | Invoices | Frozen rating run | Draft/final invoice, credit memo |

They do not share tables. They share **contracts** in `schemas/` and `docs/FACT_SCHEMA.md`. Boundaries: `docs/PRODUCT.md`.

## v1 (this tree)

- Registered dimensions only (no GROUP BY on free-form JSON)
- Idempotent event ingest
- Daily facts with watermarks; close then adjust, never edit
- List rate card + one contract overlay
- Replayable rating runs
- One invoice per legal entity
- Stripe collect adapter is a stub

```bash
cd easy-billing
node --test
node src/suite.js
```

Suite listens on `http://127.0.0.1:8787`. Send `Idempotency-Key` on event ingest.

## Non-goals for v1

Payments, tax engines, dunning, ERP, real-time per-request pricing as the bill, unbounded custom fields as billable dimensions.