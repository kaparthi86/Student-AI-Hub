(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PrivacyHouseFilter = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LIST_IDS = ["always", "advertising", "health", "brokers"];

  function enabledLists(rules) {
    const next = ["always", "brokers"];
    if ((rules || {}).shopping === "never") next.push("advertising");
    if ((rules || {}).health !== "allow") next.push("health");
    return unique(next);
  }

  function unique(items) {
    return Array.from(new Set(items));
  }

  function parseList(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith("#"));
  }

  function normalizeName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");
  }

  function matchesDomain(queryName, listed) {
    const name = normalizeName(queryName);
    if (!name || !listed) return false;
    if (listed.has(name)) return true;
    const parts = name.split(".");
    for (let i = 1; i < parts.length; i += 1) {
      const suffix = parts.slice(i).join(".");
      if (suffix.includes(".") && listed.has(suffix)) return true;
    }
    return false;
  }

  function buildBlockSet(listTextById, rules) {
    const set = new Set();
    enabledLists(rules).forEach((id) => {
      parseList(listTextById[id]).forEach((domain) => set.add(domain));
    });
    return set;
  }

  function hostsFile(domains) {
    return Array.from(domains)
      .sort()
      .map((domain) => `0.0.0.0 ${domain}`)
      .join("\n");
  }

  function domainFile(domains) {
    return Array.from(domains).sort().join("\n");
  }

  return {
    LIST_IDS,
    enabledLists,
    parseList,
    normalizeName,
    matchesDomain,
    buildBlockSet,
    hostsFile,
    domainFile,
  };
});
