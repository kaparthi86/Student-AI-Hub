#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const journeyJs = fs.readFileSync(path.join(root, "public/journey.js"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(/msc-nav-panel--grouped/.test(indexHtml), "Learn menu must be grouped");
assert(/msc-nav-group-label[^>]*>Understand</.test(indexHtml), "Understand group label");
assert(/msc-nav-group-label[^>]*>Practice</.test(indexHtml), "Practice group label");
assert(/msc-nav-group-label[^>]*>Plan</.test(indexHtml), "Plan group label");
assert(/id="tabFocus"/.test(indexHtml) && /data-tab="focus"/.test(indexHtml), "Focus under Learn");
assert(!/id="tabGaps"/.test(indexHtml), "Gaps removed from Profile/Learn nav");
assert(/id="progressGapsSection"/.test(indexHtml), "Gaps scan lives on Progress");
assert(/id="gapsScanBtn"/.test(indexHtml), "gapsScanBtn on Progress");
assert(/coachMathModeBtn/.test(indexHtml), "Math mode on Coach study bar");
assert(/learnGroupUnderstand/.test(indexHtml), "My Learning hub Understand group");
assert(/learnGroupPractice/.test(indexHtml), "My Learning hub Practice group");
assert(/learnGroupPlan/.test(indexHtml), "My Learning hub Plan group");
assert(
  !/profileMenu[\s\S]*data-tab="gaps"/.test(indexHtml) &&
    !/profileMenu[\s\S]*data-tab="focus"/.test(indexHtml),
  "Profile menu must not list Gaps or Focus"
);
assert(/requested === "gaps"/.test(appJs) || /openGapsSection/.test(appJs), "gaps redirects to progress");
assert(/raw === "math"/.test(appJs), "Math study mode opens math workspace");
assert(/data-scroll-to="progressGapsSection"/.test(journeyJs), "Progress links to gaps scan section");

console.log("ia-grouping-smoke OK");
