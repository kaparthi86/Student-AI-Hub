# My Student Coach — Lightweight Android (Play Store)

**Recommended path:** package the live HTTPS PWA as a **Trusted Web Activity (TWA)** with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).  
You keep one web codebase; Play gets a thin Android wrapper (~few MB) that opens `https://www.my-student-coach.com` full-screen.

```text
Play Store app (TWA)  →  Chrome Custom Tabs / WebView-less Trusted Web Activity
                      →  https://www.my-student-coach.com  (your existing Node/PWA)
```

## Why TWA (not a full Kotlin rewrite)

| Approach | Weight | Fits this product |
|----------|--------|-------------------|
| **TWA / Bubblewrap** | Lightest | **Yes** — already PWA + Android shell UI |
| Capacitor / Cordova | Medium | Possible later if you need plugins |
| Native Kotlin | Heaviest | Only after product-market fit |

## Prerequisites

1. Live HTTPS site: `https://www.my-student-coach.com` (or your canonical host)  
2. Valid PWA: `manifest.webmanifest` + service worker + icons (already in `public/`)  
3. Google Play Console account (one-time developer fee)  
4. Local: **Node 18+**, **JDK 17+**, Android SDK (Bubblewrap can guide install)

## One-time setup

### 1. Confirm PWA + Digital Asset Links

```bash
# After deploy
curl -sI https://www.my-student-coach.com/manifest.webmanifest
curl -s https://www.my-student-coach.com/.well-known/assetlinks.json
```

Edit `public/.well-known/assetlinks.json` and replace:

- `REPLACE_WITH_UPLOAD_KEY_SHA256`
- `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` (from Play Console → App signing)

Get the upload key fingerprint after you create the keystore:

```bash
keytool -list -v -keystore android/signing/android.keystore -alias mystudentcoach
```

Redeploy the site so Play’s crawler can read asset links.

### 2. Generate the Android project

```bash
chmod +x android/scripts/init-twa.sh
./android/scripts/init-twa.sh
# or interactively:
cd android/twa
npx @bubblewrap/cli init --manifest https://www.my-student-coach.com/manifest.webmanifest
```

Config defaults live in `android/twa/twa-manifest.json`  
(`packageId`: `com.mystudentcoach.app`).

### 3. Build an App Bundle (.aab)

```bash
cd android/twa
npx @bubblewrap/cli build
```

Upload the `.aab` in **Play Console → Create app → Production / Internal testing**.

### 4. Play Console checklist

- [ ] App name: **My Student Coach**  
- [ ] Category: Education  
- [ ] Short + full description (honor code / not a homework cheat tool)  
- [ ] Screenshots: phone Home, Ask, Voice, Profile  
- [ ] Privacy policy URL: `https://www.my-student-coach.com/privacy.html`  
- [ ] Content rating questionnaire  
- [ ] Target audience / Families policy if under-18  
- [ ] Data safety form (Google login via Supabase; on-device prefs)  
- [ ] Internal testing track first → closed → production  

## Store listing blurb (draft)

> My Student Coach is a free AI study companion for Ask, Code, Notebook, and Voice tutoring. Built for learning and practice — not for submitting AI work as your own.

## Signing keys (do not commit)

```bash
mkdir -p android/signing
# create keystore once; never push passwords or .keystore to git
```

`android/signing/` is gitignored.

## Updating after web releases

Most UX changes deploy with the website — **no new Play upload required**.  
Upload a new `.aab` only when you change `packageId`, permissions, icons, shortcuts, or `appVersionCode`.

```bash
cd android/twa
npx @bubblewrap/cli update
npx @bubblewrap/cli build
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Browser bar shows inside the app | Asset Links mismatch — fix SHA-256 + package name, wait for Google to recrawl |
| Google login fails in TWA | Add Play / app origins if needed; ensure Supabase redirect URLs include your HTTPS host |
| Voice mic blocked | Chrome permission prompts inside TWA; test on a physical device |
| Cold start slow | Upgrade Render (or host) before a public Play launch wave |

---

See also: [`docs/android-play-launch.md`](../docs/android-play-launch.md) for **Play vs Google AI Studio** and a day-by-day launch plan.
