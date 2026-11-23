#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const journeyJs = fs.readFileSync(path.join(root, "public/journey.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/companion-experience.css"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(/design-system\.css/.test(indexHtml), "design-system.css linked");
assert(/companion-experience\.css/.test(indexHtml), "companion-experience.css linked");
const ds = fs.readFileSync(path.join(root, "public/design-system.css"), "utf8");
assert(/--ds-teal:\s*#287a89/i.test(ds), "design system keeps brand teal");
assert(/Outfit/.test(ds), "design system uses Outfit");
assert(/Source Serif 4/.test(ds), "design system uses Source Serif");
assert(!/Inter/.test(ds), "design system rejects Inter");
assert(!/lavender|indigo/i.test(ds), "design system rejects indigo/lavender SaaS palette");
assert(/id="celebrateToast"/.test(indexHtml), "celebrate toast mount");
assert(/id="coachKeepGoing"/.test(indexHtml), "keep-going mount");
assert(/id="practiceJourneyCta"/.test(indexHtml), "practice journey CTA mount");
assert(/data-bottom="voice"/.test(indexHtml), "Talk bottom nav");
assert(/data-ask-action="voice"/.test(indexHtml), "voice is a chat action");
assert(/Talk with Coach/.test(appJs), "voice path remains in the coach");
assert(/renderConceptMasteryList/.test(journeyJs), "concept mastery viz");
assert(/progress-next-banner/.test(journeyJs), "progress → next step banner");
assert(/snapshot-overall-ring/.test(journeyJs), "snapshot overall ring");
assert(/renderCoachKeepGoing/.test(appJs), "continuous coach keep-going");
assert(/showCelebrateToast/.test(appJs), "celebrate toast helper");
assert(/bottomKey = "voice"/.test(appJs), "voice bottom active state");
assert(/\.concept-mastery-list/.test(css), "mastery styles");
assert(/\.coach-keep-going/.test(css), "keep-going styles");
assert(/prefers-reduced-motion/.test(css), "a11y reduced motion");

console.log("companion-phases-smoke OK");
