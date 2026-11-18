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

assert(/companion-experience\.css/.test(indexHtml), "companion-experience.css linked");
assert(/id="celebrateToast"/.test(indexHtml), "celebrate toast mount");
assert(/id="coachKeepGoing"/.test(indexHtml), "keep-going mount");
assert(/id="practiceJourneyCta"/.test(indexHtml), "practice journey CTA mount");
assert(/data-bottom="voice"/.test(indexHtml), "Talk bottom nav");
assert(/Talk with Coach/.test(journeyJs), "home Voice tile");
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
