# Launch Plan — My Student Coach

| Field | Value |
|-------|-------|
| Document ID | LAUNCH-MSC-2026-PUBLIC |
| Environments | Local → Render → Custom domain |
| Auth | Supabase Google OAuth |
| Inference | Hugging Face Inference Providers (Router) |

## 1. Pre-launch gate

| Gate | Owner check | Pass criteria |
|------|-------------|---------------|
| Secrets | Host env only | `HF_API_TOKEN`, Supabase keys not in git |
| Auth URLs | Supabase + Google Cloud | Site URL + Redirect URLs + JS origins match HTTPS host |
| Health | `/api/health` | `hfConfigured: true`, expected `hfModel` |
| Legal | Privacy + Terms live | Linked from login and footer |
| Beta banner | Env | `BETA_TESTING=0` for public; `=1` for invite cohort |
| Feedback | Optional | Service role + `assistant_feedback` table **or** accept ndjson |
| Cold start | Hosting plan | Accept free-tier ~30s or upgrade before campaign |

## 2. Launch sequence

1. Merge to `main`; confirm Render auto-deploy.  
2. Verify custom domain TLS.  
3. Smoke: Google login → Ask stream → Code → Notebook upload → Voice one turn.  
4. Share **one** canonical HTTPS URL.  
5. Day-0: watch auth failures and HF 401/model_not_supported.  
6. Day-7: feedback summary + cost export into evidence pack.

## 3. Comms kit

- One-liner: “My Student Coach — focused AI for studying, not another chatbot.”  
- Demo script: see `../03-product-history/demo-script.md`  
- Investor leave-behind: `pitch/index.html` (print to PDF)

## 4. Rollback

| Failure | Action |
|---------|--------|
| HF auth outage | Demo mode message; status toast; keep login/static UX |
| OAuth break | Re-check Redirect URLs; temporary `BETA_TESTING=1` |
| Bad model routing | Change `HF_MODEL` to known-good `:fastest` / `:groq` suffix without code deploy if env-only |

## 5. Post-launch 30-day plan

| Week | Focus |
|------|-------|
| 1 | Stability: auth, abort/stop, Safari |
| 2 | Quality: thumbs reasons → one contract fix |
| 3 | Cost: cache hit rate + voiceMode savings snapshot |
| 4 | Mobile: TWA spike or install prompt A/B |
