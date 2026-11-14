#!/usr/bin/env node
/**
 * Static ownership / isolation smoke: APIs must use session user id, not body user id.
 * Run: node scripts/isolation-ownership-smoke.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

const ownershipRoutes = [
  { name: "workspace GET", needle: 'app.get("/api/workspace"' },
  { name: "workspace PUT", needle: 'app.put("/api/workspace"' },
  { name: "analytics profile GET", needle: 'app.get("/api/analytics/profile"' },
  { name: "analytics profile PUT", needle: 'app.put("/api/analytics/profile"' },
  { name: "analytics events", needle: 'app.post("/api/analytics/events"' },
  { name: "account delete", needle: 'app.post("/api/account/delete"' },
  { name: "admin dashboard", needle: 'app.get("/api/analytics/dashboard"' },
];

for (const route of ownershipRoutes) {
  const idx = server.indexOf(route.needle);
  assert(idx !== -1, `Missing ${route.name}`);
  if (idx === -1) continue;
  const window = server.slice(idx, idx + 500);
  assert(/requireSession/.test(window), `${route.name} must use requireSession`);
  assert(!/req\.body\?\.userId|req\.body\.user_id|body\.userId/.test(window), `${route.name} must not trust body user id`);
}

assert(/canAccessAnalyticsAdmin|analyticsAdminAllowlist/.test(server), "admin analytics must be allowlisted");
assert(/req\.user\.id|req\.user\?\.id/.test(server), "server must authorize via session user id");

const rls = fs.readFileSync(path.join(root, "supabase/rls_ownership_verify.sql"), "utf8");
assert(/revoke all on public\.user_workspace/i.test(rls), "RLS verify must revoke user_workspace");
assert(/revoke all on public\.student_profiles/i.test(rls), "RLS verify must revoke student_profiles");
assert(/revoke all on public\.analytics_events/i.test(rls), "RLS verify must revoke analytics_events");

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error("isolation-ownership-smoke FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log("isolation-ownership-smoke OK");
