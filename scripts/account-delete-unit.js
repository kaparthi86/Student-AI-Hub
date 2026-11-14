#!/usr/bin/env node
/**
 * Unit test for account deletion verification (mocked Supabase admin).
 * Run: node scripts/account-delete-unit.js
 */
const assert = require("assert");
const { deleteAccountCompletely, OWNED_TABLES } = require("../lib/account-delete");

function makeAdmin({ failTables = [], remainingAfter = {} } = {}) {
  const store = Object.fromEntries(OWNED_TABLES.map((t) => [t, [{ user_id: "u1" }]]));
  return {
    from(table) {
      return {
        delete() {
          return {
            eq() {
              if (failTables.includes(table)) {
                return Promise.resolve({ error: { message: `fail:${table}` } });
              }
              store[table] = [];
              return Promise.resolve({ error: null });
            },
          };
        },
        select() {
          return {
            eq() {
              const remaining = remainingAfter[table];
              const count =
                remaining != null ? remaining : Array.isArray(store[table]) ? store[table].length : 0;
              return Promise.resolve({ count, error: null });
            },
          };
        },
      };
    },
    auth: {
      admin: {
        deleteUser() {
          return Promise.resolve({ error: null });
        },
      },
    },
  };
}

async function run() {
  const ok = await deleteAccountCompletely(makeAdmin(), "u1");
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.authDeleted, true);
  assert.ok(ok.verified.every((v) => v.ok && v.remaining === 0));

  const failCritical = await deleteAccountCompletely(
    makeAdmin({ failTables: ["student_profiles"] }),
    "u1",
  );
  assert.strictEqual(failCritical.ok, false);
  assert.match(String(failCritical.authError), /student_profiles/);

  const verifyFail = await deleteAccountCompletely(
    makeAdmin({ remainingAfter: { user_workspace: 1 } }),
    "u1",
  );
  assert.strictEqual(verifyFail.ok, false);
  assert.match(String(verifyFail.authError), /user_workspace/);

  // eslint-disable-next-line no-console
  console.log("account-delete-unit OK");
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
