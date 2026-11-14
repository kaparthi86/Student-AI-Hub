/**
 * Account + data deletion for signed-in students (service_role only).
 * Cascades cover most intelligence tables; we also wipe workspace + feedback explicitly.
 */

async function deleteUserOwnedRows(admin, userId) {
  const tables = [
    "analytics_events",
    "learning_activity",
    "learning_progress",
    "user_sessions",
    "user_consents",
    "student_profiles",
    "user_workspace",
    "assistant_feedback",
  ];
  const results = [];
  for (const table of tables) {
    try {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      results.push({ table, ok: !error, error: error?.message || null });
    } catch (err) {
      results.push({ table, ok: false, error: String(err?.message || err) });
    }
  }
  return results;
}

async function deleteAccountCompletely(admin, userId) {
  if (!admin || !userId) {
    return { ok: false, error: "not_configured" };
  }
  const tableResults = await deleteUserOwnedRows(admin, userId);
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
  };
}

module.exports = {
  deleteUserOwnedRows,
  deleteAccountCompletely,
};
