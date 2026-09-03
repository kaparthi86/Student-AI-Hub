# Launch Neo Clouds — step by step (like AI Hub)

Your domain: **https://neocloudsmarketplace.com**

This guide mirrors the AI Hub launch path: deploy → DNS → verify → share.

---

## Step 1 — Local smoke test

```bash
cd neo-clouds
cp .env.example .env
node --test          # all tests green
npm start            # http://localhost:8788
```

Open:

| URL | Expect |
|---|---|
| `/` | Marketplace UI with demo listings (if `SEED_DEMO=1`) |
| `/api/health` | `"ok": true`, `"indexHtmlDeployed": true` |
| `/privacy.html` | Privacy page |
| `/terms.html` | Terms page |

Click **Get API Key** → register as customer → **Reserve** on a listing.

---

## Step 2 — Push to GitHub

Do **not** commit `.env`. Secrets go in the host UI only.

```bash
git add neo-clouds
git commit -m "Prepare Neo Clouds for launch on neocloudsmarketplace.com"
git push origin cursor/neo-clouds-marketplace-e68b
```

Merge PR #59 to `main` when ready (or deploy from the feature branch first).

---

## Step 3 — Deploy on Render

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect your GitHub repo
3. Point at **`neo-clouds/render.yaml`** (Root Directory for the blueprint file is `neo-clouds`)
4. Render creates service **`neo-clouds-marketplace`**

Default env (already in blueprint):

| Variable | Launch value |
|---|---|
| `NODE_ENV` | `production` |
| `CANONICAL_DOMAIN` | `neocloudsmarketplace.com` |
| `SEED_DEMO` | `1` (demo listings until real providers join) |
| `BETA_TESTING` | `0` (public launch) |

For **invite-only early access**, set:

- `BETA_TESTING=1`
- `BETA_MESSAGE=Your custom banner text`

5. Wait for deploy. Copy the `*.onrender.com` URL.

---

## Step 4 — Custom domain (neocloudsmarketplace.com)

1. Render → your web service → **Settings → Custom Domains**
2. Add **`neocloudsmarketplace.com`**
3. At your registrar (where you bought the domain), create the DNS records Render shows:

   | Type | Typical use |
   |---|---|
   | **CNAME** | `www` → Render hostname |
   | **ALIAS / ANAME** or **A** | apex `@` → Render (follow Render’s exact instructions) |

4. Wait for **Verified** + TLS (often 5–30 minutes, sometimes longer for apex)

Pick one canonical host:

- Prefer **`https://www.neocloudsmarketplace.com`** *or* apex — redirect the other at Render or your DNS host.

---

## Step 5 — Launch checks (same idea as AI Hub `/api/health`)

```bash
curl -s https://neocloudsmarketplace.com/api/health | jq
```

Confirm:

- `"ok": true`
- `"indexHtmlDeployed": true`
- `"betaMessage": ""` for public launch (non-empty only in beta mode)
- `"listings"` > 0 when `SEED_DEMO=1`

Browser checks:

- `/` — hero, stats strip, GPU cards
- **Get API Key** — register customer, key saved
- **Reserve** — reservation succeeds
- `#models` — model cards, **Try** chat streams
- `/privacy.html` + `/terms.html` load

---

## Step 6 — Turn off demo seed (when real providers join)

In Render **Environment**:

```
SEED_DEMO=0
```

Redeploy. Real providers register with role **provider**, attest nodes, create listings.

Provider flow:

1. **Get API Key** → role **Provider**
2. `POST /v1/nodes` → register GPU host
3. `POST /v1/nodes/:id/attest`
4. `POST /v1/listings` → set price
5. Optional: `POST /v1/models` → inference model on that node

---

## Step 7 — Message you can paste

> **Neo Clouds** is live — an open GPU marketplace.  
> **Link:** https://neocloudsmarketplace.com  
> Browse H100/A100 listings, get a free API key, reserve compute, or try inference models.  
> Early access: reservations and inference may be simulated until providers connect real hardware.

---

## Step 8 — Before a large traffic wave

| Item | Action |
|---|---|
| Hosting | Upgrade Render plan (free tier cold-starts ~30s) |
| Demo data | `SEED_DEMO=0` when you have real listings |
| Billing | Wire Easy Billing Meter (reservations + inference usage) |
| Persistence | v1 is in-memory — plan Postgres/Redis before production scale |
| Real GPUs | SSH key exchange + vLLM worker on provider nodes |
| Monitoring | Uptime check on `/api/health` |

---

## Optional — extract to its own repo

Neo Clouds is in `neo-clouds/` inside Student AI Hub today. For a clean product repo:

1. Create `github.com/you/neo-clouds-marketplace`
2. Copy `neo-clouds/` to repo root
3. Deploy from that repo with `render.yaml` at root (`rootDir: .`)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `/` is 404 | Render **Root Directory** must be `neo-clouds` if blueprint is at repo root, or `.` if repo is Neo Clouds only |
| Empty marketplace | Set `SEED_DEMO=1` or register a provider and create listings |
| Reserve fails | Customer API key required (`nck_...`) |
| Domain not verifying | DNS propagation; confirm CNAME/A matches Render exactly |
| Cold start slow | Upgrade plan or use a uptime ping every 10 min (not ideal long-term) |
