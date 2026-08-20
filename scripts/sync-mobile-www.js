#!/usr/bin/env node
/**
 * Copies the web app shell into /www for Capacitor packaging.
 * Production Capacitor config still loads https://www.my-student-coach.com;
 * /www is the bundled fallback / local preview surface.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "public");
const dest = path.join(root, "www");

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "server.js" || entry.name === "package.json" || entry.name === "package-lock.json" || entry.name === "README.md" || entry.name === "render.yaml" || entry.name === "node_modules") {
      continue;
    }
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rimraf(dest);
copyDir(src, dest);
console.log("Synced public/ -> www/ for Capacitor");
