/**
 * Account + data deletion for signed-in students (service_role only).
 * Verifies critical tables are empty for the user after delete.
 * Writes a minimal deletion audit row (no message content / emails).
 */

const CRITICAL_TABLES = ["student_profiles", "user_workspace", "user_consents"];

const OWNED_TABLES = [
  "analytics_events",
  "learning_activity",
  "learning_progress",
  "user_sessions",
  "user_consents",
  "student_profiles",
  "user_workspace",
  "assistant_feedback",
];

async function deleteUserOwnedRows(admin, userId) {
  const results = [];
  for (const table of OWNED_TABLES) {
    try {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      results.push({ table, ok: !error, error: error?.message || null });
    } catch (err) {
      results.push({ table, ok: false, error: String(err?.message || err) });
    }
  }
  return results;
}

async function verifyUserRowsGone(admin, userId) {
  const checks = [];
  for (const table of OWNED_TABLES) {
    try {
      const { count, error } = await admin
        .from(table)
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId);
      const remaining = Number(count || 0);
      checks.push({
        table,
        ok: !error && remaining === 0,
        remaining,
        error: error?.message || null,
      });
    } catch (err) {
      checks.push({ table, ok: false, remaining: null, error: String(err?.message || err) });
    }
  }
  return checks;
}

async function writeDeletionAudit(admin, { userIdHash, ok, tables, authDeleted }) {
  if (!admin) return { ok: false };
  try {
    const { error } = await admin.from("account_deletion_audit").insert({
      user_id_hash: String(userIdHash || "").slice(0, 64),
      ok: Boolean(ok),
      auth_deleted: Boolean(authDeleted),
      tables_json: tables || [],
      created_at: new Date().toISOString(),
    });
    return { ok: !error, error: error?.message || null };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function hashUserId(userId) {
  try {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 32);
  } catch {
    return "unknown";
  }
}

async function deleteAccountCompletely(admin, userId) {
  if (!admin || !userId) {
    return { ok: false, error: "not_configured" };
  }

  let tableResults = await deleteUserOwnedRows(admin, userId);
  const failedFirst = tableResults.filter((r) => !r.ok);
  if (failedFirst.length) {
    // One retry for transient failures before aborting critical path.
    const retry = await deleteUserOwnedRows(admin, userId);
    const byTable = Object.fromEntries(retry.map((r) => [r.table, r]));
    tableResults = tableResults.map((r) => (r.ok ? r : byTable[r.table] || r));
  }

  const criticalFailed = tableResults.filter(
    (r) => CRITICAL_TABLES.includes(r.table) && !r.ok,
  );
  if (criticalFailed.length) {
    const out = {
      ok: false,
      authDeleted: false,
      authError: `Could not delete critical data (${criticalFailed.map((r) => r.table).join(", ")}).`,
      tables: tableResults,
      verified: [],
    };
    await writeDeletionAudit(admin, {
      userIdHash: hashUserId(userId),
      ok: false,
      tables: tableResults,
      authDeleted: false,
    });
    return out;
  }

  const verified = await verifyUserRowsGone(admin, userId);
  const criticalStillPresent = verified.filter(
    (c) => CRITICAL_TABLES.includes(c.table) && (!c.ok || c.remaining > 0),
  );
  if (criticalStillPresent.length) {
    const out = {
      ok: false,
      authDeleted: false,
      authError: `Deletion verification failed for ${criticalStillPresent.map((c) => c.table).join(", ")}.`,
      tables: tableResults,
      verified,
    };
    await writeDeletionAudit(admin, {
      userIdHash: hashUserId(userId),
      ok: false,
      tables: tableResults,
      authDeleted: false,
    });
    return out;
  }

  let authDeleted = false;
  let authError = null;
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) authError = error.message || String(error);
    else authDeleted = true;
  } catch (err) {
    authError = String(err?.message || err);
  }

  const result = {
    ok: authDeleted,
    authDeleted,
    authError,
    tables: tableResults,
    verified,
  };
  await writeDeletionAudit(admin, {
    userIdHash: hashUserId(userId),
    ok: authDeleted,
    tables: tableResults,
    authDeleted,
  });
  return result;
}

module.exports = {
  OWNED_TABLES,
  CRITICAL_TABLES,
  deleteUserOwnedRows,
  verifyUserRowsGone,
  deleteAccountCompletely,
  writeDeletionAudit,
  hashUserId,
};
