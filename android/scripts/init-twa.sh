#!/usr/bin/env bash
# Initialize / update the Trusted Web Activity Android project with Bubblewrap.
# Requires: Node 18+, JDK 17+, Android SDK cmdline tools (Bubblewrap can install SDK).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TWA_DIR="$ROOT/android/twa"
MANIFEST="$TWA_DIR/twa-manifest.json"
HOST_URL="${TWA_HOST_URL:-https://www.my-student-coach.com}"

cd "$TWA_DIR"
echo "TWA dir: $TWA_DIR"
echo "Host:    $HOST_URL"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing $MANIFEST" >&2
  exit 1
fi

export BUBBLEWRAP_KEYSTORE_PASSWORD="${BUBBLEWRAP_KEYSTORE_PASSWORD:-}"
export BUBBLEWRAP_KEY_PASSWORD="${BUBBLEWRAP_KEY_PASSWORD:-}"

if [[ ! -d app ]]; then
  echo "First-time init via Bubblewrap (interactive if passwords unset)…"
  npx --yes @bubblewrap/cli@1.22.5 init \
    --manifest "$HOST_URL/manifest.webmanifest" \
    --directory "$TWA_DIR" || true
  echo "If init completed, copy fingerprints into public/.well-known/assetlinks.json"
else
  echo "Existing Android project detected — running update + build…"
  npx --yes @bubblewrap/cli@1.22.5 update --skipVersionUpgrade || true
fi

echo ""
echo "Next:"
echo "  1) npx @bubblewrap/cli build"
echo "  2) Put SHA-256 fingerprints into public/.well-known/assetlinks.json"
echo "  3) Deploy site, verify: curl -s $HOST_URL/.well-known/assetlinks.json"
echo "  4) Upload android/twa/app/build/outputs/bundle/release/*.aab to Play Console"
