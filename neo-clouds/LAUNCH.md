# Launch Neo Clouds at neocloudsmarketplace.com

Neo Clouds is a **separate product** from Student AI Hub. It gets its own GitHub repo, Render service, and domain.

**Canonical URL:** https://neocloudsmarketplace.com

See also: [PRODUCT.md](./PRODUCT.md)

---

## Overview

| Step | What |
|---|---|
| 1 | Standalone repo (not Student AI Hub) |
| 2 | Render web service `neo-clouds-marketplace` |
| 3 | DNS → `neocloudsmarketplace.com` |
| 4 | Verify `/api/health` |
| 5 | Share the link |

Do **not** deploy Neo Clouds using AI Hub’s root `render.yaml` or AI Hub’s domain.

---

## Step 1 — Standalone GitHub repo

Create a new repo, e.g. **`neo-clouds-marketplace`**, empty (no README).

**Private is fine.** Render can deploy from a private repo if your GitHub account is connected. Use private while you launch; switch to public later if you want others to fork the marketplace.

Public is only required if you want the “open-source GPU marketplace” pitch to include a public source repo. The product at **neocloudsmarketplace.com** works the same either way.

**If you are working in Cursor Cloud**, this environment cannot push to the private repo (GitHub token is only for Student-AI-Hub). Use this instead — the standalone tree is already on a public branch:

```bash
git clone --depth 1 -b cursor/neo-clouds-standalone-e68b https://github.com/kaparthi86/Student-AI-Hub.git neo-clouds-src
cd neo-clouds-src
git remote set-url origin https://github.com/kaparthi86/neo-clouds-marketplace.git
git push -u origin HEAD:main
```

That copies only Neo Clouds files (`src/`, `public/`, `render.yaml`) onto your private repo `main`.

Or, from this folder on a machine that can see the private repo:

```bash
./scripts/publish-standalone.sh https://github.com/kaparthi86/neo-clouds-marketplace.git
```

The repo root should contain `package.json`, `render.yaml`, `src/`, `public/` — not a nested `neo-clouds/` folder.

**Ongoing development:** work in the standalone repo, or sync from `neo-clouds/` in Student-AI-Hub when needed.

---

## Step 2 — Local smoke test

```bash
cp .env.example .env
node --test
npm start
```

Open http://localhost:8788 — listings, **Get API Key**, reserve, `#models` chat.

---

## Step 3 — Deploy on Render (Neo Clouds only)

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect **`neo-clouds-marketplace`** repo (not Student-AI-Hub)
3. Blueprint file: **`render.yaml`** at repo root
4. Service name: **`neo-clouds-marketplace`**
5. Root Directory: **leave blank** (repo root)

Environment (defaults in `render.yaml`):

| Variable | Launch |
|---|---|
| `NODE_ENV` | `production` |
| `CANONICAL_DOMAIN` | `neocloudsmarketplace.com` |
| `SEED_DEMO` | `1` |
| `BETA_TESTING` | `0` |

Invite-only beta: `BETA_TESTING=1` + `BETA_MESSAGE=...`

---

## Step 4 — Custom domain

1. Render → **neo-clouds-marketplace** → **Settings → Custom Domains**
2. Add **`neocloudsmarketplace.com`** (and optionally `www.neocloudsmarketplace.com`)
3. At your domain registrar, add the DNS records Render shows
4. Wait for Verified + TLS

Pick one canonical host (apex or `www`) and redirect the other.

---

## Step 5 — Launch checks

```bash
curl -s https://neocloudsmarketplace.com/api/health
```

Expect:

- `"ok": true`
- `"service": "neo-clouds-marketplace"`
- `"canonicalDomain": "neocloudsmarketplace.com"`
- `"indexHtmlDeployed": true`

Browser:

- `/` — GPU marketplace
- `/privacy.html`, `/terms.html`
- **Get API Key** → reserve → inference **Try**

---

## Step 6 — Go live message

> **Neo Clouds** — open GPU marketplace  
> https://neocloudsmarketplace.com  
> Browse H100/A100 listings, get an API key, reserve compute, run inference.

---

## Step 7 — After real providers join

Render → `SEED_DEMO=0` → redeploy.

Provider flow: **Get API Key (Provider)** → register node → attest → listing → optional model.

---

## Step 8 — Scale checklist

| Item | Action |
|---|---|
| Hosting | Upgrade Render (free tier cold-starts) |
| Persistence | Postgres/Redis before high traffic |
| Billing | Easy Billing Meter API (optional) |
| Real GPUs | SSH + vLLM on provider nodes |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| AI Hub page on your domain | Wrong Render service — domain must point to **neo-clouds-marketplace**, not student-ai-hub |
| `/` 404 | Render Root Directory must be blank for standalone repo |
| Empty listings | `SEED_DEMO=1` or add provider listings |
| Domain not verifying | DNS propagation; match Render records exactly |
