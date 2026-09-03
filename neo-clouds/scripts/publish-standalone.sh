#!/usr/bin/env bash
# Publish Neo Clouds as a standalone git repo (separate from Student AI Hub).
# Usage:
#   1. Create an empty GitHub repo: neo-clouds-marketplace
#   2. ./scripts/publish-standalone.sh /path/to/neo-clouds-marketplace.git
set -euo pipefail

REMOTE="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="/tmp/neo-clouds-standalone-$$"

if [[ -z "$REMOTE" ]]; then
  echo "Usage: $0 git@github.com:YOU/neo-clouds-marketplace.git"
  echo "Create an empty repo on GitHub first, then run this from neo-clouds/."
  exit 1
fi

rm -rf "$WORK"
mkdir -p "$WORK"
rsync -a --exclude node_modules --exclude .env "$ROOT/" "$WORK/"

cd "$WORK"
git init -b main
git add .
git commit -m "Initial Neo Clouds Marketplace — standalone product for neocloudsmarketplace.com"
git remote add origin "$REMOTE"
git push -u origin main

echo "Done. Deploy on Render from this repo (render.yaml at root), domain neocloudsmarketplace.com"
