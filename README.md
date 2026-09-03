# Neo Clouds — Open-Source GPU Marketplace

**Neo Clouds** is an open GPU compute marketplace and inference platform — browse provider listings, reserve GPU hours, and call models through an OpenAI-compatible API.

**Launch domain:** [neocloudsmarketplace.com](https://neocloudsmarketplace.com)  
**Launch guide:** [LAUNCH.md](./LAUNCH.md) (step-by-step, same flow as AI Hub)

## Quickstart

```bash
cd neo-clouds
cp .env.example .env
node --test
npm start
# → http://localhost:8788
```

Set `SEED_DEMO=1` in `.env` to load demo H100/A100 listings and models on boot.

## What you get

| Layer | Features |
|---|---|
| **Marketplace** | Provider nodes, attestation, listings, reservations |
| **Inference** | OpenAI-compatible `/v1/chat/completions`, streaming, usage metering |
| **Web UI** | Dark marketplace at `/` — browse without login, API key for reserve/chat |
| **Launch** | `/api/health`, Privacy + Terms, Render blueprint, beta banner |

## Deploy

See **[LAUNCH.md](./LAUNCH.md)** for the full checklist. Short version:

1. Deploy `neo-clouds/render.yaml` on Render
2. Point **neocloudsmarketplace.com** at the service
3. Verify `/api/health` → `indexHtmlDeployed: true`
4. Share the URL

## API (summary)

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/health` | No |
| `POST` | `/v1/auth/register` | No |
| `GET` | `/v1/listings` | No (browse) |
| `GET` | `/v1/models` | No (browse) |
| `GET` | `/v1/stats` | No |
| `POST` | `/v1/reservations` | Customer key |
| `POST` | `/v1/chat/completions` | Any key |

Full detail in source and tests.

## Easy Billing (next)

Wire reservations and inference usage to [Easy Billing](../easy-billing/) Meter for per-GPU-hour and per-token invoicing.

## License

Open-source — fork, extend, run your own marketplace.
