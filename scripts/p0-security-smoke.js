#!/usr/bin/env node
/**
 * Static P0 security / launch-readiness smoke checks (no live credentials required).
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

// Public support must NOT use requireSession
assert(/app\.post\("\/api\/public-support"/.test(server), "public-support route missing");
const pubIdx = server.indexOf('app.post("/api/public-support"');
assert(pubIdx !== -1 && !/requireSession/.test(server.slice(pubIdx, pubIdx + 80)), "public-support must be unauthenticated");

// 3) Account deletion helper + endpoint exist
assert(fs.existsSync(path.join(root, "lib/account-delete.js")), "lib/account-delete.js missing");
assert(/deleteAccountCompletely/.test(server), "server must call deleteAccountCompletely");
assert(/Type DELETE to confirm/.test(server), "delete endpoint must require DELETE confirmation");
assert(/verifyUserRowsGone/.test(read("lib/account-delete.js")), "deletion must verify rows are gone");

// 4) Support returns ticket IDs
assert(/ticketId/.test(server) && /MSC-/.test(server), "support flow must mint MSC-* ticket IDs");

// 5) Workspace RLS revoke present
const workspaceSql = read("supabase/user_workspace.sql");
assert(/revoke all on public\.user_workspace from anon, authenticated/i.test(workspaceSql), "user_workspace.sql must revoke anon/authenticated");

// 6) Privacy discloses analytics detail + opt-out + voice + AI + contact
const privacy = read("public/privacy.html");
assert(/Product analytics events/i.test(privacy), "privacy.html must list analytics events");
assert(/login_completed/.test(privacy), "privacy.html must name concrete event examples");
assert(/What happens when you opt out/i.test(privacy), "privacy.html must explain opt-out");
assert(/Voice Tutor and transcripts/i.test(privacy), "privacy.html must explain voice transcripts");
assert(/How AI providers handle/i.test(privacy), "privacy.html must explain AI provider handling");
assert(/Delete account and data/i.test(privacy), "privacy.html must describe deletion workflow");
assert(/13 years of age or older/i.test(privacy), "privacy.html must state age policy");
assert(/public support form/i.test(privacy), "privacy.html must offer public contact without sign-in");
assert(/Supabase Auth/i.test(privacy), "privacy.html must name Supabase Auth");
assert(/Render/i.test(privacy), "privacy.html must name Render hosting");
assert(/Hugging Face/i.test(privacy), "privacy.html must name Hugging Face");
assert(/Retention schedule/i.test(privacy), "privacy.html must include retention schedule");
assert(!/remove \(or request deletion of\)/i.test(privacy), "privacy.html must not hedge deletion language");
assert(!/or similar providers/i.test(privacy), "privacy.html must not use 'or similar providers'");
assert(!/such as Render/i.test(privacy), "privacy.html must name Render directly, not 'such as Render'");
assert(!/rolling operational window/i.test(privacy), "privacy.html must not use vague rolling operational window");
assert(/router\.huggingface\.co/i.test(privacy), "privacy.html must name the HF router endpoint");
assert(/180 days/i.test(privacy), "privacy.html must state guest support retention days");

// 7) Profile copy no longer claims device-only storage
const indexHtml = read("public/index.html");
assert(!/These stay on this device/i.test(indexHtml), "index.html must not claim profile stays on this device only");
assert(/stay in sync across devices/i.test(indexHtml), "index.html should describe cross-device profile sync");

// 8) Study Planner must be a live workspace — no Coming Soon / roadmap screen
assert(!/Phase 1 roadmap/i.test(indexHtml), "index.html must not show Phase 1 roadmap Coming Soon for planner");
assert(!/id="panelComingSoon"/i.test(indexHtml), "Coming Soon panel must be removed from index.html");
assert(!/This workspace is not available yet/i.test(indexHtml), "index.html must not say workspace is not available yet");
assert(/Available now — daily activities/i.test(indexHtml), "planner panel should state Available now");
assert(/id="panelPlanner"/i.test(indexHtml), "live panelPlanner must exist");
assert(/data-tab="planner"/i.test(indexHtml), "Learn nav must route to planner");
const appJs = read("public/app.js");
assert(/COACH_SOON_TABS = new Set\(\)/.test(appJs), "COACH_SOON_TABS must be empty (no soon routes)");
assert(/"planner"/.test(appJs) && /COACH_JOURNEY_TABS/.test(appJs), "planner must be a journey tab");

// 9) Terms describe broader product + AI processing
const terms = read("public/terms.html");
assert(/Voice Tutor/i.test(terms), "terms.html should mention Voice Tutor / broader features");
assert(/How AI processing works/i.test(terms), "terms.html should explain AI processing");

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error("P0 security smoke FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log("P0 security smoke OK (" + guarded.length + " guarded routes checked).");
