#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const journeyJs = fs.readFileSync(path.join(root, "public/journey.js"), "utf8");
const journeyCss = fs.readFileSync(path.join(root, "public/journey.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(/function pickNextStep\(/.test(journeyJs), "pickNextStep required");
assert(/function startNextStep\(/.test(journeyJs), "startNextStep required");
assert(/data-journey-next-step/.test(journeyJs), "next-step CTA still wired for progress");
assert(/cold-start/.test(journeyJs), "cold-start diagnostic path");
assert(/home_next_step_started/.test(journeyJs), "analytics event for next step");
assert(/pickNextStep,/.test(journeyJs) || /pickNextStep\s*,/.test(journeyJs), "pickNextStep exported");
assert(/\.journey-next-step\s*\{/.test(journeyCss), "next-step styles");
assert(/data-tab="planner"/.test(indexHtml), "planner stays reachable outside the reply chips");
assert(!/id="askToolActions"/.test(indexHtml), "reply tool row removed");
assert(/id="journeyHomeMount"|journey-home-mount/.test(indexHtml), "home mount present");
assert(/Create My Learning Snapshot/.test(journeyJs) || /Continue Learning/.test(journeyJs), "snapshot CTA still exists");
assert(/askLaunchChip/.test(journeyJs), "Ask chip reads streak and last lesson");

console.log("home-next-step-smoke OK");
