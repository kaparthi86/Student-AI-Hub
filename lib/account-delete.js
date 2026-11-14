/**
 * Account + data deletion for signed-in students (service_role only).
 * Verifies critical tables are empty for the user after delete.
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

async function deleteAccountCompletely(admin, userId) {
  if (!admin || !userId) {
    return { ok: false, error: "not_configured" };
  }

  const tableResults = await deleteUserOwnedRows(admin, userId);
  const criticalFailed = tableResults.filter(
    (r) => CRITICAL_TABLES.includes(r.table) && !r.ok,
  );
  if (criticalFailed.length) {
    return {
      ok: false,
      authDeleted: false,
      authError: `Could not delete critical data (${criticalFailed.map((r) => r.table).join(", ")}).`,
      tables: tableResults,
      verified: [],
    };
  }

  const verified = await verifyUserRowsGone(admin, userId);
  const criticalStillPresent = verified.filter(
    (c) => CRITICAL_TABLES.includes(c.table) && (!c.ok || c.remaining > 0),
  );
  if (criticalStillPresent.length) {
    return {
      ok: false,
      authDeleted: false,
      authError: `Deletion verification failed for ${criticalStillPresent.map((c) => c.table).join(", ")}.`,
      tables: tableResults,
      verified,
    };
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

  return {
    ok: authDeleted,
    authDeleted,
    authError,
    tables: tableResults,
    verified,
  };
}

module.exports = {
  OWNED_TABLES,
  CRITICAL_TABLES,
  deleteUserOwnedRows,
  verifyUserRowsGone,
  deleteAccountCompletely,
};
