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
- Optional: **`BETA_TESTING=1`** and **`BETA_MESSAGE=...`** to show a top banner for invite-only testing (see below)
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` are optional for server; **frontend auth uses `public/config.js`**

Hugging Face tokens should include **Inference Providers** permissions (fine-grained token) per Hugging Face docs.

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

## Private beta testing URL (~20 people)

Use a **single HTTPS URL** everyone shares (e.g. Render). That URL is your **testing link**; keep the repo private or share the link only with your cohort.

### What you do once (host)

1. Push the project to **GitHub** (do not commit `.env`; set secrets in the host UI).
2. Deploy (e.g. **Render ? New ? Blueprint**, pick `render.yaml`). The blueprint sets **`BETA_TESTING=1`** so the app shows a **private beta banner** (optional **`BETA_MESSAGE`** in Render **Environment** overrides the default text).
3. In Render **Environment**, set **`HF_API_TOKEN`** (required for real AI). Optional: `HF_MODEL`, `HF_CHAT_URL`, `BETA_MESSAGE` (e.g. *"CS101 pilot ù report bugs to you@school.edu"*).
4. Copy the live URL, e.g. `https://student-ai-hub.onrender.com` ù **that is the only link you send** (up to ~20 testers is fine on free tier for light use; first request after sleep may take ~30s).

### Supabase + Google (required for login on that URL)

In **Supabase ? Authentication ? URL configuration**:

- Set **Site URL** to your testing URL (or your school page that links to it).
- Under **Redirect URLs**, add `https://YOUR-SERVICE.onrender.com` and `https://YOUR-SERVICE.onrender.com/**`.

In **Google Cloud Console** (OAuth client used by Supabase): add **Authorized JavaScript origins** `https://YOUR-SERVICE.onrender.com`.

`public/config.js` should point at the same Supabase project you configured.

### Message you can paste to testers

> We are running a **short private beta** (about 20 people) of Student AI Hub.  
> **Link:** `https://YOUR-SERVICE.onrender.com`  
> Sign in with **Google**. Ask learning questions, use **Code** for programming help, or upload a study file under **Notebook**.  
> This is a test build: answers can be wrong, and the app may change or restart. Do not submit AI output if your course forbids it.

### Checks

- Open `https://YOUR-SERVICE.onrender.com/api/health` ù `"hfConfigured": true` when the token is set; **`betaMessage`** is non-empty when beta mode is on.
- Confirm **`"indexHtmlDeployed": true`**. If it is **`false`**, the server cannot see `public/index.html` (you will see a startup log about a missing file, and `/` returns Not Found). Fix it by:
  1. Locally: `git add public` then `git commit` and `git push` so GitHub contains `public/index.html`, `public/app.js`, `public/styles.css`, and `public/config.js`.
  2. Render **Settings ? Root Directory**: leave **empty** unless the app really lives in a subfolder (then Root Directory must be that folder, and `public/` must be inside it).
  3. Trigger **Manual Deploy** on Render after the push.
- Confirm the amber **beta banner** appears at the top after load.

### Optional: tunnel instead of deploy

For a **very short** test you can use `npx localtunnel --port 3001` or [ngrok](https://ngrok.com) while `npm start` runs locally. Add the tunnel `https://...` URL to Supabase redirect URLs and Google OAuth origins; tunnel URLs change unless you use a reserved domain.

## API (for debugging)

- `POST /api/chat` JSON: `{ "mode": "learn"|"code", "message": "...", "history": [{ "role": "user"|"assistant", "content": "..." }] }`
- `POST /api/doc-insights` multipart form field `document` (file)
- `POST /api/ai` still works for one-shot prompts (optional)

## Notes

- If `HF_API_TOKEN` is missing, API returns a demo message so UI still works.
- PDF support uses `pdf-parse` (best-effort text extraction).
- Large documents are truncated server-side for safety; increase `MAX_DOC_CHARS` in `server.js` if needed.
- For a wider public launch, add rate limits and server-side auth checks for `/api/chat`, `/api/doc-insights`, and `/api/ai`; turn off **`BETA_TESTING`** or clear **`BETA_MESSAGE`** when you are ready to drop the banner.
