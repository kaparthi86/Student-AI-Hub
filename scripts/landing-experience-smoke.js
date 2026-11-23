#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/simplify-coach.css"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public/app.js"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(/id="landingCard"/.test(indexHtml), "landingCard present");
assert(/class="[^"]*msc-welcome/.test(indexHtml), "welcome is a single screen");
assert(/id="landingGetStartedBtn"/.test(indexHtml), "Get Started button present");
assert(/data-open-login/.test(indexHtml), "Get Started uses existing login gateway");
assert(/href="\.\/privacy\.html"/.test(indexHtml), "privacy.html route preserved");
assert(/href="\.\/terms\.html"/.test(indexHtml), "terms.html route preserved");
assert(/id="panelChat"/.test(indexHtml), "Ask panel preserved");
assert(/id="askProgressChip"/.test(indexHtml), "quiet progress chip on Ask");
assert(/id="askScanBtn"/.test(indexHtml), "scan a page is a visible way in");
assert(/id="askSubjectRow"/.test(indexHtml), "pick a subject is a visible way in");
assert(/id="chatSearchInput"/.test(indexHtml), "composer is on Ask");
assert(/data-tab="planner"/.test(indexHtml), "planner screen stays reachable");
assert(/data-tab="flashcards"/.test(indexHtml), "flashcards screen stays reachable");
assert(!/id="askToolActions"/.test(indexHtml), "tool row is not shown after an Ask reply");
assert(/id="tabProgress"/.test(indexHtml), "Progress tab preserved");
assert(/id="panelPlanner"/.test(indexHtml) || /data-tab="planner"/.test(indexHtml), "planner screen preserved");
assert(!/class="landing-preview"/.test(indexHtml), "welcome is not a snapshot preview");
assert(!/id="mscFaq"/.test(indexHtml), "welcome is not a long marketing page");
assert(!/from-blue-600 to-violet-600/.test(indexHtml), "no purple SaaS gradient markup");
assert(/setMainTab\("chat"\)/.test(appJs), "signed-in entry opens Ask");
assert(/\.msc-welcome-glass/.test(css), "welcome uses the glass surface");
assert(/--ds-navy:\s*#142d4c/i.test(fs.readFileSync(path.join(root, "public/design-system.css"), "utf8")), "navy glass tokens remain");
assert(!/Finance AI/.test(fs.readFileSync(path.join(root, "README.md"), "utf8")), "README drops Finance AI identity");
assert(/# My Student Coach/.test(fs.readFileSync(path.join(root, "README.md"), "utf8")), "README uses My Student Coach");

console.log("landing-experience-smoke OK");
