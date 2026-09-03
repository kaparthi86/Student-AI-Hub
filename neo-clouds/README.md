# Neo Clouds — Open-Source GPU Marketplace

Neo Clouds is an open-source GPU compute marketplace where **providers** list GPU capacity with prices and **customers** browse, filter, and reserve instances through a simple REST API.

## How it differs from Vast.ai

| | Vast.ai | Neo Clouds |
|---|---|---|
| Source | Closed | **Open** |
| Protocol | Proprietary | **Standard REST** |
| Composability | Monolithic | **Embed or extend freely** |
| Auth model | Required | Pluggable (v1: none) |
| Pricing arithmetic | Float | **BigInt (no rounding errors)** |

Neo Clouds is designed to be embedded in larger platforms, federations, or private clouds. Fork it, extend it, run it yourself.

## Quickstart

```bash
cd neo-clouds
node src/marketplace.js
# Listening on port 8788
```

Set `PORT` env var to override the default port.

## API Summary

All routes are under `/v1` except `/health`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/v1/providers` | Register a provider |
| `GET` | `/v1/providers` | List providers |
| `POST` | `/v1/providers/:provider_id/listings` | Add a GPU listing |
| `GET` | `/v1/listings` | Browse listings (filterable) |
| `GET` | `/v1/listings/:listing_id` | Get one listing |
| `PATCH` | `/v1/listings/:listing_id` | Update price / availability |
| `DELETE` | `/v1/listings/:listing_id` | Remove listing |
| `POST` | `/v1/reservations` | Reserve a listing |
| `GET` | `/v1/reservations` | List reservations (filter by customer_id) |
| `GET` | `/v1/reservations/:reservation_id` | Get one reservation |
| `POST` | `/v1/reservations/:reservation_id/cancel` | Cancel a reservation |
| `GET` | `/v1/stats` | Live marketplace statistics |

### Listing filter params

`GET /v1/listings?gpu_model=H100-SXM5-80GB&region=us-east-1&spot=false&min_vram_gb=40&max_price_per_hour=3.00&available=true`

## Running tests

```bash
cd neo-clouds
node --test
```

## Metering (future)

Integrate the **Easy Billing Meter** (`/easy-billing/`) to emit usage events per reservation-hour. The reservation `total_price` field is already computed with BigInt arithmetic compatible with the billing meter's scale factor.
