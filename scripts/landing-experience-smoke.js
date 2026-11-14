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
assert(/class="landing-preview"/.test(indexHtml), "product preview present");
assert(/Understand\. Practice\. Improve\./.test(indexHtml), "journey positioning present");
assert(/id="mscFaq"/.test(indexHtml), "FAQ section present");
assert(/data-open-login/.test(indexHtml), "Get Started uses existing login gateway");
assert(/href="\.\/privacy\.html"/.test(indexHtml), "privacy.html route preserved");
assert(/href="\.\/terms\.html"/.test(indexHtml), "terms.html route preserved");
assert(/Study Planner &amp; Progress/.test(indexHtml), "Planner/Progress advertised as live");
assert(!/from-blue-600 to-violet-600/.test(indexHtml), "no purple SaaS gradient markup");
assert(/landingNavToggle/.test(appJs), "mobile nav toggle wired");
assert(/\.landing-preview-frame/.test(css), "preview styles present");
assert(/msc-landing \.landing-hero\.msc-hero::after/.test(css), "legacy hero overlay disabled");

console.log("landing-experience-smoke OK");
