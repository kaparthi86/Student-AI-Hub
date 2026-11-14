#!/usr/bin/env node
/**
 * Unit test: server-side consent opt-out blocks analytics inserts.
 * Run: node scripts/consent-opt-out-unit.js
 */
const assert = require("assert");
const analytics = require("../lib/analytics");

function makeAdmin(consentRow) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      if (table === "user_consents") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: consentRow, error: null }),
                };
              },
            };
          },
          upsert: async () => ({ error: null }),
        };
      }
      if (table === "analytics_events") {
        return {
          insert: async (rows) => {
            inserts.push(...rows);
            return { error: null };
          },
        };
      }
      if (table === "student_profiles") {
        return {
          upsert: async () => ({ error: null }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };
}

async function run() {
  const optedOut = makeAdmin({
    analytics_enabled: false,
    learning_analytics_enabled: false,
    personalization_enabled: false,
    consent_version: "2026-11-14",
  });
  const blocked = await analytics.insertEvents(
    optedOut,
    "user-1",
    [{ event_name: "tab_opened", feature: "home" }],
    { consent: { analytics_enabled: true } }, // client lie must be ignored
  );
  assert.strictEqual(blocked.skipped, "consent_opt_out");
  assert.strictEqual(optedOut.inserts.length, 0);

  const optedIn = makeAdmin({
    analytics_enabled: true,
    learning_analytics_enabled: true,
    personalization_enabled: true,
    consent_version: "2026-11-14",
  });
  const allowed = await analytics.insertEvents(optedIn, "user-1", [
    { event_name: "tab_opened", feature: "home" },
  ]);
  assert.strictEqual(allowed.inserted, 1);
  assert.strictEqual(optedIn.inserts.length, 1);

  const learningBlocked = await analytics.recordLearningActivity(
    optedOut,
    "user-1",
    { activity_type: "focus", feature: "focus" },
  );
  assert.strictEqual(learningBlocked.skipped, "learning_analytics_opt_out");

  // eslint-disable-next-line no-console
  console.log("consent-opt-out-unit OK");
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
