# Student AI Hub MVP

A prototype for a free student-focused AI app with:

- Google login (Supabase Auth)
- Chat-style **Learning** + **Code** tutors (conversation memory in the browser session)
- **Doc Notebook**: upload `.txt/.md/.csv/.json/.pdf` and get structured study notes
- Backend API calling open-source models via Hugging Face **Inference Providers** (Router)

## 1) Setup

```bash
cd /Users/santhosh/student-ai-mvp
npm install
cp .env.example .env
```

Put `.env` in the **same folder as `server.js`** (`student-ai-mvp/.env`). The server loads it automatically.

Fill `.env`:

- `HF_API_TOKEN` (optional for demo, required for real model output)
- Optional: `HF_MODEL` (default in code: `deepseek-ai/DeepSeek-V4-Pro:fastest`)
- Optional: `HF_CHAT_URL` (default: `https://router.huggingface.co/v1/chat/completions`)
- Optional live web for Ask (pick one): `TAVILY_API_KEY`, or `BRAVE_SEARCH_API_KEY`, or `SERPER_API_KEY`
- Optional: **`BETA_TESTING=1`** and **`BETA_MESSAGE=...`** to show a top banner for invite-only testing (public launch defaults leave this off)
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` are optional for server; **frontend auth uses `public/config.js`**
- For thumbs feedback in Supabase: set **`SUPABASE_SERVICE_ROLE_KEY`** on the server and run `supabase/assistant_feedback.sql`

See `.env.example` for a full template. With a search key set, Ask’s **Live web** toggle grounds answers in current web snippets and shows source links.

Hugging Face tokens should include **Inference Providers** permissions (fine-grained token) per Hugging Face docs.

### Assistant feedback (Supabase)

Helpful / Not helpful votes only appear in Supabase when **both** are true:

1. `SUPABASE_SERVICE_ROLE_KEY` is set on the host (Render Environment / `.env`) — never in `public/config.js`
2. Table `public.assistant_feedback` exists (run `supabase/assistant_feedback.sql` in SQL Editor)

Otherwise the API still returns success, but rows are written to `feedback.ndjson` on the server (or `/tmp`, which is ephemeral on Render). Check `/api/health` → `feedbackSupabaseConfigured: true`, then submit a vote and query:

```sql
select id, rating, reason, mode, study_mode, created_at
from public.assistant_feedback
order by created_at desc
limit 50;
```

## 2) Frontend auth config

Edit `public/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "YOUR_SUPABASE_URL",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

In Supabase:

- Enable Google provider in Auth
- Under **Authentication ? URL Configuration**, set **Site URL** and add every app URL under **Redirect URLs** (scheme, host, port, and path must match what testers use in the browser). Examples: `http://localhost:3001`, `http://localhost:3001/**`, and your **deployed HTTPS URL** plus `https://your-app.onrender.com/**`. If Google login fails with *"The string did not match the expected pattern"* (often in Safari), the redirect URL is usually missing from this list, or the page was opened as `file://` instead of from the server.

## 3) Run

```bash
PORT=3001 npm run dev
```

Open: [http://localhost:3001](http://localhost:3001)

Verify Hugging Face env is picked up:

`http://localhost:3001/api/health` should show `"hfConfigured": true`

## Custom production domain (your own URL)

The app does **not** hardcode a hostname. Google OAuth uses `window.location.origin` in `public/app.js`, so the same deploy works on `http://localhost:PORT`, `https://your-service.onrender.com`, and **`https://your-real-domain.com`** after DNS and provider settings match.

1. **Render (or your host)**  
   In your web service, open **Settings ? Custom Domains** and add the hostname(s) you own (for example `www.example.edu` and/or the apex `example.edu`). Render shows the **DNS records** (usually CNAME) you must create at your registrar or DNS host. See [Render: Custom domains](https://render.com/docs/custom-domains). Wait until the domain verifies and TLS is active.

2. **Supabase**  
   **Authentication ? URL Configuration:** set **Site URL** to the canonical public URL users will open (for example `https://www.example.edu`). Under **Redirect URLs**, add that origin with a path wildcard, for example `https://www.example.edu/**`. If you still use the old `onrender.com` URL during migration, keep those redirect entries too until everyone has switched.

3. **Google Cloud Console**  
   For the **OAuth 2.0 Web client** used by Supabase Google sign-in, add **Authorized JavaScript origins** for every HTTPS origin you use (apex and `www` if both exist). Mismatches here cause sign-in or redirect errors in the browser.

4. **Pick one canonical host**  
   Prefer either apex or `www`, redirect the other at the CDN or host level, so cookies and redirects stay consistent.

No change to `public/config.js` is required for the domain itself (only Supabase URL/key stay as they are). Redeploy after DNS is optional unless you are also shipping code changes.

## Deploy / launch URL

Use a **single HTTPS URL** everyone shares (e.g. Render + custom domain). That URL is your public link.

### What you do once (host)

1. Push the project to **GitHub** (do not commit `.env`; set secrets in the host UI).
2. Deploy (e.g. **Render → New → Blueprint**, pick `render.yaml`). Public launch defaults set **`BETA_TESTING=0`** (no banner). For an invite-only cohort, set **`BETA_TESTING=1`** and optional **`BETA_MESSAGE`** in Render **Environment**.
3. In Render **Environment**, set **`HF_API_TOKEN`** (required for real AI). Optional: `HF_MODEL`, `HF_CHAT_URL`, `BETA_MESSAGE`.
4. Copy the live URL, e.g. `https://www.my-student-coach.com` — share that link. Free-tier hosting can cold-start (~30s); upgrade before a large inbound wave.

### Supabase + Google (required for login on that URL)

In **Supabase ? Authentication ? URL configuration**:

- Set **Site URL** to your testing URL (or your school page that links to it).
- Under **Redirect URLs**, add `https://YOUR-SERVICE.onrender.com` and `https://YOUR-SERVICE.onrender.com/**`.

In **Google Cloud Console** (OAuth client used by Supabase): add **Authorized JavaScript origins** `https://YOUR-SERVICE.onrender.com`.

`public/config.js` should point at the same Supabase project you configured.

### Message you can paste

> **AI Hub** is open — start with **Student AI**.  
> **Link:** `https://www.my-student-coach.com`  
> Join with **Google**. Use **Ask**, **Code**, or **Notebook** for study help.  
> AI can be wrong - check important facts. Follow your honor code; do not submit AI output if your course forbids it.

### Checks

- Open `/api/health` — `"hfConfigured": true` when the token is set; **`betaMessage`** is empty for public launch (non-empty only when beta mode is on).
- Confirm **`"indexHtmlDeployed": true`**. If it is **`false`**, the server cannot see `public/index.html` (you will see a startup log about a missing file, and `/` returns Not Found). Fix it by:
  1. Locally: `git add public` then `git commit` and `git push` so GitHub contains `public/index.html`, `public/app.js`, `public/styles.css`, and `public/config.js`.
  2. Render **Settings → Root Directory**: leave **empty** unless the app really lives in a subfolder (then Root Directory must be that folder, and `public/` must be inside it).
  3. Trigger **Manual Deploy** on Render after the push.
- Confirm `/` shows the marketing landing (AI Hub + Join with Google) and that `/privacy.html` + `/terms.html` load.

### Optional: tunnel instead of deploy

For a **very short** test you can use `npx localtunnel --port 3001` or [ngrok](https://ngrok.com) while `npm start` runs locally. Add the tunnel `https://...` URL to Supabase redirect URLs and Google OAuth origins; tunnel URLs change unless you use a reserved domain.

## API (for debugging)

- `POST /api/chat` JSON: `{ "mode": "learn"|"code", "message": "...", "history": [{ "role": "user"|"assistant", "content": "..." }] }` (optional `"stream": true` for SSE)
- `POST /api/doc-insights` multipart form field `document` (file)
- `POST /api/ai` still works for one-shot prompts (optional)

## Android / Play Store foundation

Capacitor Android shell loads the live Soft paper site (`https://www.my-student-coach.com`) so Ask / Code / Notebook, Practice under topic, honor code, and auth stay one product.

```bash
npm install
npm run mobile:sync
npm run mobile:open
```

See `store/ANDROID.md` and `store/PLAY_STORE_LISTING.md`. Before Play release, replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in `public/.well-known/assetlinks.json`.

## Notes

- If `HF_API_TOKEN` is missing, API returns a demo message so UI still works.
- PDF support uses `pdf-parse` (best-effort text extraction).
- Large documents are truncated server-side for safety; increase `MAX_DOC_CHARS` in `server.js` if needed.
- Public launch checklist: marketing landing on `/`, Privacy + Terms pages, **`BETA_TESTING=0`**, paid/always-on hosting before a large wave, `SUPABASE_SERVICE_ROLE_KEY` + feedback table for thumbs votes, and HF quota/spend alerts. Rate limits and server-side session auth are already in `server.js`.
