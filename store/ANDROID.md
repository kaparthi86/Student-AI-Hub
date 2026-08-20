# Android app guide (AI Hub / Student AI)

This repo ships a **Play-ready mobile foundation** aligned with the live Soft paper product:

1. Hardened PWA (maskable icons, offline shell, shortcuts, share target)
2. Privacy + Terms (Play Console required) with support email
3. Digital Asset Links template for App Links / TWA
4. Capacitor Android shell loading production Soft paper UI

## Architecture choice

**Production Android shell loads** `https://www.my-student-coach.com`  
so Ask / Code / Notebook, Practice under topic, honor code, auth, and APIs stay one product. Capacitor adds the native container (splash, status bar, back button, Play packaging). The website PWA remains installable too.

## Branding

- Launcher / Capacitor name: **AI Hub**
- In-app product after sign-in: **Student AI** (Ask, Code, Notebook)
- Soft paper surface: `#F7F6F3` splash + status bar

## One-time setup

### 1. Install native tooling
- Node 18+
- Android Studio (SDK 34+, build-tools)
- JDK 17+

### 2. Install deps + sync
```bash
npm install
npm run mobile:sync
npm run mobile:open
```

(`android/` is already in the repo — you normally do **not** need `npx cap add android` again.)

### 3. Digital Asset Links
1. Build a release keystore / use Play App Signing.
2. Get the SHA-256 fingerprint.
3. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in `public/.well-known/assetlinks.json`.
4. Deploy website, then verify:
   `https://www.my-student-coach.com/.well-known/assetlinks.json`

### 4. Play Console
Use `store/PLAY_STORE_LISTING.md` + `store/feature-graphic.png` + screenshots from `store/SCREENSHOTS.md`.

## Local scripts
- `npm run mobile:www` — copy `public/` → `www/`
- `npm run mobile:sync` — refresh `www/` + `npx cap sync android`
- `npm run mobile:open` — open Android Studio project

## Quality bar before launch
- [ ] Cold start feels instant on mid Android (live URL + Soft paper splash)
- [ ] Google login works inside the Capacitor WebView
- [ ] Ask / Code / Notebook happy paths
- [ ] Practice dock appears under Ask/Notebook replies (no separate Practice tab)
- [ ] Honor-code gate behaves like web
- [ ] Offline page shows when network is down
- [ ] Privacy / Terms / support email open correctly
- [ ] Data Safety form matches Privacy Policy
- [ ] `assetlinks.json` fingerprint is the production Play signing cert

## Supersedes
Replaces the stale draft Android PR (`cursor/android-worldclass-app-9472` / #11) which conflicted with Soft paper, Practice-under-topic, and launch landing work on `main`.
