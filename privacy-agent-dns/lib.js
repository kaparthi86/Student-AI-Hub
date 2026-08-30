"use strict";

const dgram = require("dgram");
const fs = require("fs");
const os = require("os");
const path = require("path");

const houseFilter = require("../public/privacy-agent/house-filter.js");

const ROOT = __dirname;
const LIST_DIR = path.join(__dirname, "..", "public", "privacy-agent", "lists");
const RULES_PATH = path.join(ROOT, "house-rules.json");
const EXAMPLE_RULES_PATH = path.join(ROOT, "house-rules.example.json");
const DEFAULT_RULES = { shopping: "never", health: "never", identity: "checkout_ok" };

function readJson(filePath, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch {
    return { ...fallback };
  }
}

function lanAddresses() {
  const found = [];
  const nets = os.networkInterfaces();
  Object.values(nets).forEach((list) => {
    (list || []).forEach((item) => {
      if (item.internal || item.family !== "IPv4") return;
      found.push(item.address);
    });
  });
  return found;
}

function decodeName(buf, offset) {
  const labels = [];
  let pos = offset;
  let end = offset;
  let jumped = false;
  let hops = 0;
  while (pos < buf.length && hops < 20) {
    const len = buf[pos];
    if (len === 0) {
      if (!jumped) end = pos + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= buf.length) break;
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1];
      if (!jumped) end = pos + 2;
      pos = ptr;
      jumped = true;
      hops += 1;
      continue;
    }
    if (pos + 1 + len > buf.length) break;
    labels.push(buf.slice(pos + 1, pos + 1 + len).toString("ascii"));
    pos += 1 + len;
    hops += 1;
  }
  return { name: labels.join("."), end };
}

function encodeName(name) {
  const parts = String(name || "").split(".").filter(Boolean);
  const chunks = parts.map((part) => Buffer.concat([Buffer.from([part.length]), Buffer.from(part)]));
  chunks.push(Buffer.from([0]));
  return Buffer.concat(chunks);
}

function questionType(query) {
  try {
    const decoded = decodeName(query, 12);
    if (decoded.end + 4 > query.length) return { name: decoded.name, type: 1 };
    return { name: decoded.name, type: query.readUInt16BE(decoded.end) };
  } catch {
    return { name: "", type: 1 };
  }
}

function buildBlockResponse(query, qname, qtype) {
  const id = query.readUInt16BE(0);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x8180, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(1, 6);
  const type = qtype === 28 ? 28 : 1;
  const question = Buffer.concat([encodeName(qname), Buffer.from([0, type, 0, 1])]);
  const rdata = type === 28 ? Buffer.alloc(16) : Buffer.from([0, 0, 0, 0]);
  const answer = Buffer.concat([
    encodeName(qname),
    Buffer.from([0, type, 0, 1, 0, 0, 0, 30, 0, rdata.length]),
    rdata,
  ]);
  return Buffer.concat([header, question, answer]);
}

function cleanRules(next) {
  return {
    shopping: next.shopping === "never" ? "never" : "ok_for_discounts",
    health: next.health === "allow" ? "allow" : "never",
    identity: next.identity === "vault_only" ? "vault_only" : "checkout_ok",
  };
}

function createRuntime() {
  const stats = {
    startedAt: Date.now(),
    queries: 0,
    blocked: 0,
    forwarded: 0,
    recent: [],
  };
  let rules = { ...DEFAULT_RULES };
  let blockSet = new Set();
  let dnsServer = null;
  let runningPort = null;
  let lastError = null;

  function loadLists() {
    const textById = {};
    houseFilter.LIST_IDS.forEach((id) => {
      const filePath = path.join(LIST_DIR, `${id}.txt`);
      textById[id] = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    });
    if (fs.existsSync(RULES_PATH)) rules = readJson(RULES_PATH, DEFAULT_RULES);
    else if (fs.existsSync(EXAMPLE_RULES_PATH)) rules = readJson(EXAMPLE_RULES_PATH, DEFAULT_RULES);
    else rules = { ...DEFAULT_RULES };
    blockSet = houseFilter.buildBlockSet(textById, rules);
  }

  function remember(name, action) {
    stats.recent.unshift({ at: Date.now(), name, action });
    stats.recent = stats.recent.slice(0, 40);
  }

  function status(extra) {
    return {
      ok: true,
      running: Boolean(dnsServer),
      inApp: true,
      rules,
      lists: houseFilter.enabledLists(rules),
      domains: blockSet.size,
      stats: { queries: stats.queries, blocked: stats.blocked, forwarded: stats.forwarded },
      recent: stats.recent.slice(0, 20),
      lan: lanAddresses(),
      dnsPort: runningPort,
      lastError,
      ...(extra || {}),
    };
  }

  function setRules(next) {
    rules = cleanRules(next || {});
    fs.writeFileSync(RULES_PATH, `${JSON.stringify(rules, null, 2)}\n`);
    loadLists();
    return status();
  }

  function start({ port, upstream } = {}) {
    const bindPort = Number(port || process.env.PRIVACY_DNS_PORT || 53);
    const resolver = upstream || process.env.PRIVACY_DNS_UPSTREAM || "1.1.1.1";
    return new Promise((resolve, reject) => {
      if (dnsServer) {
        resolve(status());
        return;
      }
      loadLists();
      const server = dgram.createSocket("udp4");
      const fail = (err) => {
        lastError = err.message;
        try {
          server.close();
        } catch {
          /* ignore */
        }
        reject(err);
      };
      server.once("error", fail);
      server.on("message", (msg, rinfo) => {
        stats.queries += 1;
        const { name, type } = questionType(msg);
        if (name && houseFilter.matchesDomain(name, blockSet)) {
          stats.blocked += 1;
          remember(name, "block");
          server.send(buildBlockResponse(msg, name, type), rinfo.port, rinfo.address);
          return;
        }
        stats.forwarded += 1;
        const client = dgram.createSocket("udp4");
        const timer = setTimeout(() => {
          try {
            client.close();
          } catch {
            /* ignore */
          }
        }, 2500);
        client.on("message", (reply) => {
          clearTimeout(timer);
          server.send(reply, rinfo.port, rinfo.address);
          try {
            client.close();
          } catch {
            /* ignore */
          }
        });
        client.on("error", () => {
          clearTimeout(timer);
          try {
            client.close();
          } catch {
            /* ignore */
          }
        });
        client.send(msg, 53, resolver);
      });
      server.bind(bindPort, "0.0.0.0", () => {
        server.removeListener("error", fail);
        server.on("error", (err) => {
          lastError = err.message;
        });
        dnsServer = server;
        runningPort = bindPort;
        lastError = null;
        resolve(status());
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      if (!dnsServer) {
        resolve(status());
        return;
      }
      const current = dnsServer;
      dnsServer = null;
      runningPort = null;
      current.close(() => resolve(status()));
    });
  }

  loadLists();
  return {
    start,
    stop,
    status,
    setRules,
    hostsText: () => `${houseFilter.hostsFile(blockSet)}\n`,
    domainsText: () => `${houseFilter.domainFile(blockSet)}\n`,
  };
}

function isCloudHost() {
  return Boolean(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME);
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "")
    .replace("::ffff:", "")
    .replace("::1", "127.0.0.1");
}

function isHomeRequest(req) {
  const ip = clientIp(req);
  if (ip === "127.0.0.1" || ip === "localhost") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

module.exports = {
  createRuntime,
  isCloudHost,
  isHomeRequest,
  lanAddresses,
};
