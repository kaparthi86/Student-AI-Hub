#!/usr/bin/env node
/**
 * Static P0 security smoke checks (no live credentials required).
 * Run: node scripts/p0-security-smoke.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// 1) Service role must not ship in frontend config
const config = read("public/config.js");
assert(!/service_role|sb_secret_|SUPABASE_SERVICE_ROLE/i.test(config), "public/config.js must not contain service role / secret keys");

// 2) Sensitive API routes require sessions
const server = read("server.js");
const guarded = [
  'app.post("/api/ai"',
  'app.post("/api/chat"',
  'app.post("/api/support"',
  'app.post("/api/account/delete"',
  'app.get("/api/workspace"',
  'app.put("/api/workspace"',
  'app.post("/api/analytics/events"',
  'app.get("/api/analytics/profile"',
  'app.put("/api/analytics/profile"',
  'app.get("/api/analytics/dashboard"',
];
for (const route of guarded) {
  const idx = server.indexOf(route);
  assert(idx !== -1, `Missing route declaration: ${route}`);
  if (idx !== -1) {
    const window = server.slice(idx, idx + 180);
    assert(/requireSession/.test(window), `${route} must use requireSession`);
  }
}

// 3) Account deletion helper + endpoint exist
assert(fs.existsSync(path.join(root, "lib/account-delete.js")), "lib/account-delete.js missing");
assert(/deleteAccountCompletely/.test(server), "server must call deleteAccountCompletely");
assert(/Type DELETE to confirm/.test(server), "delete endpoint must require DELETE confirmation");

// 4) Support returns ticket IDs
assert(/ticketId/.test(server) && /MSC-/.test(server), "support flow must mint MSC-* ticket IDs");

// 5) Workspace RLS revoke present
const workspaceSql = read("supabase/user_workspace.sql");
assert(/revoke all on public\.user_workspace from anon, authenticated/i.test(workspaceSql), "user_workspace.sql must revoke anon/authenticated");

// 6) Privacy discloses analytics + deletion
const privacy = read("public/privacy.html");
assert(/Behavioral \/ product analytics/i.test(privacy), "privacy.html must disclose behavioral analytics");
assert(/Delete account and data/i.test(privacy), "privacy.html must describe deletion workflow");
assert(/13 years of age or older/i.test(privacy), "privacy.html must state age policy");

// 7) Profile copy no longer claims device-only storage
const indexHtml = read("public/index.html");
assert(!/These stay on this device/i.test(indexHtml), "index.html must not claim profile stays on this device only");
assert(/stay in sync across devices/i.test(indexHtml), "index.html should describe cross-device profile sync");

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error("P0 security smoke FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log("P0 security smoke OK (" + guarded.length + " guarded routes checked).");
