# Launch plan — Lightweight Android + AI Studio clarity

**Product:** My Student Coach (`https://www.my-student-coach.com`)  
**Goal:** Ship a Play Store listing without rewriting the web app.

## Two different “studios” (don’t mix them)

| Tool | What it’s for | Use for Play Store? |
|------|----------------|---------------------|
| **Google Play Console** | Publish Android apps | **Yes** |
| **Android Studio** | Build / sign native or TWA projects | Yes (optional; Bubblewrap CLI is enough) |
| **Google AI Studio** | Prototype Gemini prompts / API keys | **No** — not an app store |
| **PWABuilder** | Generate store packages from a URL | Optional alternative to Bubblewrap |

**Recommendation:** use **Bubblewrap TWA** → Play Console.  
Use **AI Studio** only if you want to experiment with Gemini-side prompts separately from this Hugging Face–backed coach.

## Path A — Play Store (lightweight TWA) ★ recommended

1. Keep shipping the PWA on your canonical HTTPS domain.  
2. Fill Digital Asset Links (`public/.well-known/assetlinks.json`) after you have signing certs.  
3. Run `android/scripts/init-twa.sh` → `npx @bubblewrap/cli build`.  
4. Create the app in Play Console; upload `.aab` to **Internal testing**.  
5. Add 12+ testers; fix auth / assetlinks / screenshots.  
6. Promote to Production.

Details: [`android/README.md`](../android/README.md).

### Package identity

| Field | Value |
|-------|-------|
| Application ID | `com.mystudentcoach.app` |
| Host | `www.my-student-coach.com` |
| Version name | `1.0.0` (bump in `android/twa/twa-manifest.json`) |

## Path B — “AI Studio” style quick app demo

If the goal is a **demo / prototype surface** (not Play):

1. Open [Google AI Studio](https://aistudio.google.com/) to try Gemini prompts.  
2. Do **not** expect a Play-ready APK from AI Studio alone.  
3. For a shareable mobile demo today, use the **PWA** (“Add to Home Screen”) or Internal testing TWA.

If you later want Gemini as a **provider** inside My Student Coach, that is a separate backend change (`HF_*` → optional Gemini route) — unrelated to store packaging.

## Path C — PWABuilder (alternative)

1. Visit https://www.pwabuilder.com/  
2. Enter `https://www.my-student-coach.com`  
3. Generate Android package → download → upload to Play  

Same Asset Links requirement applies.

## Pre-flight checklist (before Play review)

- [ ] `/api/health` → `hfConfigured: true`, `indexHtmlDeployed: true`  
- [ ] Privacy + Terms linked and accurate  
- [ ] Google OAuth works on the **canonical** HTTPS host inside Chrome  
- [ ] Mobile bottom nav: Home / Tutor / Learning / Profile  
- [ ] Asset Links JSON valid JSON + real SHA-256 fingerprints  
- [ ] Screenshots (phone) for Education listing  
- [ ] Data safety + content rating completed  

## Suggested timeline (work units, not calendar guesses)

1. **Asset Links + keystore** — create signing material; deploy JSON  
2. **Bubblewrap build** — produce first `.aab`  
3. **Internal testing** — auth + Voice + Ask smoke on devices  
4. **Store listing copy + graphics**  
5. **Production rollout** (staged %)

## What stays out of git

- `android/signing/*.keystore`  
- Keystore passwords  
- Play Console service account JSON  
- Generated `android/twa/app/` build outputs (optional to gitignore after first generate)
