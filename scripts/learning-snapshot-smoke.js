#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const journeyJs = fs.readFileSync(path.join(root, "public/journey.js"), "utf8");
const journeyCss = fs.readFileSync(path.join(root, "public/journey.css"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(/Learning Snapshot/.test(indexHtml), "nav/hub uses Learning Snapshot");
assert(/Your Learning Snapshot/.test(indexHtml), "panel heading Your Learning Snapshot");
assert(/Create My Learning Snapshot/.test(journeyJs), "CTA Create My Learning Snapshot");
assert(/What You're Doing Well/.test(journeyJs), "strengths label");
assert(/Areas to Improve/.test(journeyJs), "gaps label");
assert(/Your Personalized Practice Plan/.test(journeyJs), "recommendations label");
assert(/Your Learning Growth/.test(journeyJs), "growth label");
assert(/snapshots:\s*\[\]/.test(journeyJs) || /snapshots: \[\]/.test(journeyJs), "snapshots history in journey state");
assert(/renderSnapshotHistory/.test(journeyJs), "snapshot history renderer");
assert(/\.snapshot-intro/.test(journeyCss), "snapshot styles");
assert(!/>Diagnostic</.test(indexHtml), "Diagnostic label removed from visible nav/hub");
assert(/snapshot-gap-actions|Practice/.test(journeyJs), "snapshot gaps are actionable");
assert(/askLaunchChip/.test(journeyJs), "lesson data still feeds the Ask chip");
assert(/renderDiagnosticPanel/.test(journeyJs), "Learning Snapshot screen remains");

console.log("learning-snapshot-smoke OK");
