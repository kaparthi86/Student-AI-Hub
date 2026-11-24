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

assert(/id="authCard"/.test(indexHtml), "logged-out screen is sign-in");
assert(/id="googleLoginBtn"/.test(indexHtml), "Google sign-in is on that screen");
assert(!/id="landingCard"/.test(indexHtml), "welcome is not a second page");
assert(!/landingGetStartedBtn/.test(indexHtml), "no Get Started step");
assert(!/loginBackToLandingBtn/.test(indexHtml), "nothing pages back to a welcome screen");
assert(!/data-open-login/.test(indexHtml), "nothing opens a second login page");
assert(/href="\.\/privacy\.html"/.test(indexHtml), "privacy.html route preserved");
assert(/href="\.\/terms\.html"/.test(indexHtml), "terms.html route preserved");
assert(/id="panelChat"/.test(indexHtml), "Ask panel preserved");
assert(!/Learning options/.test(indexHtml), "Learning options is not on Ask");
assert(!/id="studyModeBar"/.test(indexHtml), "study mode row is not on Ask");
assert(!/msc-advanced-options/.test(indexHtml), "no control opens Learning options");
assert(/id="askProgressChip"/.test(indexHtml), "quiet progress chip on Ask");
assert(!/id="askScanBtn"/.test(indexHtml), "scan a page is not on the Ask surface");
assert(!/id="askSubjectRow"/.test(indexHtml), "subject grid is not on the Ask surface");
assert(!/data-tab="home"/.test(indexHtml), "Home tab is not a second landing");
assert(!/data-bottom="home"/.test(indexHtml), "Home is not on the phone bar");
assert(/id="navSubjects"/.test(indexHtml), "subjects open from Ask");
assert(/id="navQuiz"/.test(indexHtml), "quiz opens from Ask");
assert(/data-tab="notebook"/.test(indexHtml), "notes open from Ask");
assert(/id="chatSearchInput"/.test(indexHtml), "composer is on Ask");
assert(/data-tab="planner"/.test(indexHtml), "planner screen stays reachable");
assert(/data-tab="flashcards"/.test(indexHtml), "flashcards screen stays reachable");
assert(!/id="askToolActions"/.test(indexHtml), "tool row is not shown after an Ask reply");
assert(/app\.js\?v=ask-login-1/.test(indexHtml), "Ask script URL changes so the old login bundle is not reused");
assert(!/else showLanding\(/.test(appJs), "logged-out visitors open sign-in, not a welcome page");
assert(/scope === "learn" \|\| scope === "ask" \|\| scope === "chat"\) return \[\]/.test(appJs), "Ask composer does not grow a second practice chip");
assert(!/textContent = t\("practice_this_topic"\)/.test(appJs), "Practice this topic is not mounted on a reply");
assert(!/keys = \["simpler", "example", "practice"\]/.test(appJs), "practice is not a second follow-up chip");
assert(/id="tabProgress"/.test(indexHtml), "Progress tab preserved");
assert(/id="panelPlanner"/.test(indexHtml) || /data-tab="planner"/.test(indexHtml), "planner screen preserved");
assert(!/class="landing-preview"/.test(indexHtml), "welcome is not a snapshot preview");
assert(!/id="mscFaq"/.test(indexHtml), "welcome is not a long marketing page");
assert(!/from-blue-600 to-violet-600/.test(indexHtml), "no purple SaaS gradient markup");
assert(/setMainTab\("chat"\)/.test(appJs), "signed-in entry opens Ask");
assert(/\.msc-login-card[\s\S]*backdrop-filter:\s*blur\(18px\)/.test(css), "sign-in uses the glass surface");
assert(/--ds-navy:\s*#142d4c/i.test(fs.readFileSync(path.join(root, "public/design-system.css"), "utf8")), "navy glass tokens remain");
assert(!/Finance AI/.test(fs.readFileSync(path.join(root, "README.md"), "utf8")), "README drops Finance AI identity");
assert(/# My Student Coach/.test(fs.readFileSync(path.join(root, "README.md"), "utf8")), "README uses My Student Coach");

console.log("landing-experience-smoke OK");
