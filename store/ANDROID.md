# Android app guide (Student AI Hub)

This repo ships a **world-class mobile foundation**:

1. Hardened PWA (icons, offline shell, shortcuts, share target)
2. Privacy + Terms pages (Play Console required)
3. Digital Asset Links template for TWA / App Links
4. Capacitor Android shell config pointing at production

## Architecture choice

**Production Android shell loads** `https://www.my-student-coach.com`  
so Ask/Code/Notebook + auth/API stay one product. Capacitor adds the native container (splash, status bar, Play packaging). The website PWA remains installable too.

## One-time setup

### 1. Install native tooling
- Node 18+
- Android Studio (SDK 34+, build-tools)
- JDK 17+

### 2. Install Capacitor deps
```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/app @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/share
npx cap add android
```

### 3. Sync & open
```bash
npm run mobile:sync
npm run mobile:open
```

### 4. Digital Asset Links
1. Build a release keystore / use Play App Signing.
2. Get the SHA-256 fingerprint.
3. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in `public/.well-known/assetlinks.json`.
4. Deploy website, then verify:
   `https://www.my-student-coach.com/.well-known/assetlinks.json`

### 5. Play Console
Use `store/PLAY_STORE_LISTING.md` + `store/feature-graphic.png` + screenshots.

## Local scripts
- `npm run mobile:sync` — refresh `www/` web snapshot + `cap sync`
- `npm run mobile:open` — open Android Studio project
- `npm run mobile:build` — assemble debug APK when Android SDK is configured

## Quality bar before launch
- [ ] Cold start under ~2s on mid Android
- [ ] Google login works inside WebView/TWA
- [ ] Ask / Code / Notebook happy paths
- [ ] Offline page shows when network is down
- [ ] Privacy/Terms links open
- [ ] Data Safety form matches Privacy Policy
- [ ] assetlinks.json fingerprint is production signing cert
