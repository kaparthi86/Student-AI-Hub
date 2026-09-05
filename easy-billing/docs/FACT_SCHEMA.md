# Fact schema and API map

JSON Schema files in `schemas/` are the source of truth. This document is the human map.

Amounts and quantities are **decimal strings** (not IEEE floats). Money is major units of `currency` with up to 6 fractional digits. Quantity uses the meter’s `unit`.

## 1. Usage event (Meter ingest)

Idempotent on `(tenant_id, event_id)`. Duplicates return the original acceptance.

| Field | Rule |
|---|---|
| `event_id` | Client-generated, unique per tenant. Also the HTTP `Idempotency-Key`. |
| `account_id` | Buyer account. |
| `legal_entity_id` | Required, or resolvable from `dimensions.legal_country`. |
| `meter_id` | Must exist. |
| `timestamp` | Event time, RFC 3339 UTC. Windowing uses this, not ingest time. |
| `quantity` | Decimal string, ≥ 0 in v1. |
| `dimensions` | Only keys registered on the meter. Extra keys rejected or, if prefixed `meta.`, folded into `metadata`. |
| `metadata` | Never billable. Analytics only. |

Grain for v1 daily facts: `window.start` = UTC date of `timestamp`, `window.end` = next UTC date.

## 2. Billable fact (Meter → Rate)

One row per `(account_id, legal_entity_id, meter_id, window, dimension-tuple)`.

| Field | Rule |
|---|---|
| `fact_id` | Assigned by Meter. Immutable id. |
| `window.grain` | `day` in v1. |
| `quantity` | Aggregated (`sum`). |
| `aggregation` | Copied from the meter. |
| `watermark` | Last `as_of` that included this window. |
| `closed` | After period close, no in-place change. |
| `revision` | `1` original. `>1` is an adjustment fact. |
| `supersedes_fact_id` | Previous fact this adjustment replaces for rating. |

Rate reads **head facts**: for a key, the highest revision that is not itself superseded.

Close API: `POST /aggregations/close` with `window_end`. Events whose `timestamp < window_end` that arrive later create revision facts.

## 3. Rate card and contract (Rate config)

**Rate card (list):** versioned. Rules:

- `model`: `per_unit` | `volume` | `tiered`
- `match`: subset of dimensions (empty match = all facts for the meter)
- `unit_price` or `tiers[]` (`up_to` + `unit_price`; last tier `up_to` null = remainder)
- `currency`

**Contract overlay:** versioned. Points at a rate card. May override `unit_price` for matched rules, set `minimum_amount`, `effective_at`, `end_at`. Applies to one `account_id` and optionally one `legal_entity_id` (omit entity = all entities on the account).

## 4. Rating result (Rate → Ledger)

| Field | Rule |
|---|---|
| `rating_run_id` | Assigned by Rate. |
| `status` | `simulated` or `frozen`. Ledger bills only `frozen`. |
| `rate_card_version` / `contract_version` | Pinned on freeze. |
| `fact_refs[]` | `fact_id` + `quantity` actually rated (snapshot). |
| `lines[]` | One line per fact (v1). Includes `legal_entity_id`, `meter_id`, `amount`. |

Replay: freeze stores enough to recompute. A second freeze on the same inputs must equal the first; if config changed, it is a new run.

## 5. Invoice (Ledger)

Split **one frozen run → N invoices**, one per `legal_entity_id`.

| Field | Rule |
|---|---|
| `invoice_id` | Assigned at draft. |
| `invoice_number` | Assigned at finalize. |
| `status` | `draft` \| `final` \| `void` |
| `legal_entity_id` / `legal_country` / `currency` | From the entity, not from a usage tag. |
| `rating_run_id` | Provenance. |
| `lines[]` | Copied from rating lines for that entity. |

Credit memo: new document, negative `amount`, `references_invoice_id`. Never mutate `final`.

## v1 HTTP (suite process)

All paths are under `/v1/tenants/:tenant_id`. JSON in/out.

**Control**

- `POST /` — create tenant (body: `{ "tenant_id"?: string, "name": string }`)
- `POST /dimensions` — `{ "key", "cardinality_cap" }`
- `POST /accounts` — `{ "account_id", "name" }`
- `POST /legal-entities` — `{ "legal_entity_id", "account_id", "legal_country", "currency" }`

**Meter**

- `POST /meters`
- `POST /events` — single event or `{ "events": [] }`
- `POST /aggregations/run` — `{ "as_of" }`
- `POST /aggregations/close` — `{ "window_end" }`
- `GET /facts?account_id&from&to`

**Rate**

- `POST /rate-cards`
- `POST /contracts`
- `POST /rating-runs` — `{ "account_id", "window_start", "window_end", "contract_id"?, "simulate"? }`
- `GET /rating-runs/:rating_run_id`

**Ledger**

- `POST /invoices/draft` — `{ "rating_run_id" }`
- `POST /invoices/:invoice_id/finalize`
- `POST /invoices/:invoice_id/collect` — `{ "provider": "stripe" }`
- `POST /credit-memos` — `{ "invoice_id", "amount", "reason" }`

## Cardinality and isolation (v1 policy)

Default caps if unset: `service` 200, `legal_country` 300, `region` 80. Ingest fails with `dimension_cardinality` when a new value would exceed the cap. Tenant data is isolated in process memory in v1; production must partition Meter by `(tenant_id, account_id)` and keep Ledger regional-per-entity.