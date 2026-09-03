# Neo Clouds Marketplace

Open GPU marketplace and inference platform — **separate from [Student AI Hub](https://github.com/kaparthi86/Student-AI-Hub)**.

**Live site:** [neocloudsmarketplace.com](https://neocloudsmarketplace.com)  
**Launch guide:** [LAUNCH.md](./LAUNCH.md)  
**Product boundary:** [PRODUCT.md](./PRODUCT.md)

Providers list GPU capacity. Customers browse by model, region, and price, reserve hours, and call models via an OpenAI-compatible API.

## Quickstart

```bash
cp .env.example .env
node --test
npm start
# → http://localhost:8788
```

`SEED_DEMO=1` loads sample H100/A100 listings and models.

## Deploy (standalone)

1. Use repo **`neo-clouds-marketplace`** (not Student-AI-Hub) — see [LAUNCH.md](./LAUNCH.md)
2. Render Blueprint → `render.yaml` at repo root
3. Custom domain → **neocloudsmarketplace.com**
4. Verify `/api/health`

## Features

- GPU listings, reservations, provider nodes + attestation
- OpenAI-compatible `/v1/chat/completions` with streaming
- Public browse; API keys for reserve and inference
- Privacy, Terms, health check, beta banner

## API

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/health` | No |
| `POST` | `/v1/auth/register` | No |
| `GET` | `/v1/listings` | No |
| `GET` | `/v1/models` | No |
| `POST` | `/v1/reservations` | Customer key |
| `POST` | `/v1/chat/completions` | Any key |

## License

Open source — fork and run your own marketplace.
