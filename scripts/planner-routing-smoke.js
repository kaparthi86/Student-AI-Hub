#!/usr/bin/env node
/**
 * Study Planner routing smoke: live panel, no Coming Soon, nav targets planner.
 * Run: node scripts/planner-routing-smoke.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const journeyJs = fs.readFileSync(path.join(root, "public/journey.js"), "utf8");

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(!/panelComingSoon/.test(indexHtml), "panelComingSoon must be removed");
assert(!/This workspace is not available yet/.test(indexHtml), "no 'not available yet' copy");
assert(/id="panelPlanner"/.test(indexHtml), "panelPlanner required");
assert(/id="plannerPanelBody"/.test(indexHtml), "plannerPanelBody required");
assert(/data-tab="planner"/.test(indexHtml), "Learn menu Study Planner data-tab=planner");
assert(/data-coach-tab="planner"/.test(indexHtml), "Learning hub tile data-coach-tab=planner");
assert(/function renderPlannerPanel/.test(journeyJs), "renderPlannerPanel required");
assert(/plannerGoalForm|planGoal/.test(journeyJs), "planner goal form required");
assert(/data-journey-done/.test(journeyJs), "mark-done controls required");
assert(/refresh-plan/.test(journeyJs), "rebuild plan control required");
assert(/COACH_SOON_TABS = new Set\(\)/.test(appJs), "no soon tabs");
assert(/mainTab === "planner"/.test(appJs), "setMainTab must special-case planner visibility");

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error("planner-routing-smoke FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log("planner-routing-smoke OK");
