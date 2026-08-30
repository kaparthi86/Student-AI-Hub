#!/usr/bin/env node
"use strict";

const dgram = require("dgram");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const houseFilter = require("../public/privacy-agent/house-filter.js");

const ROOT = __dirname;
const LIST_DIR = path.join(__dirname, "..", "public", "privacy-agent", "lists");
const RULES_PATH = path.join(ROOT, "house-rules.json");
const EXAMPLE_RULES_PATH = path.join(ROOT, "house-rules.example.json");

const DNS_PORT = Number(process.env.PRIVACY_DNS_PORT || 53);
const HTTP_PORT = Number(process.env.PRIVACY_DNS_HTTP_PORT || 8787);
const UPSTREAM = process.env.PRIVACY_DNS_UPSTREAM || "1.1.1.1";

const DEFAULT_RULES = { shopping: "never", health: "never", identity: "checkout_ok" };

const stats = {
  startedAt: Date.now(),
  queries: 0,
  blocked: 0,
  forwarded: 0,
  recent: [],
};

let rules = { ...DEFAULT_RULES };
let blockSet = new Set();

function readJson(filePath, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch {
    return { ...fallback };
  }
}

function loadRules() {
  if (fs.existsSync(RULES_PATH)) return readJson(RULES_PATH, DEFAULT_RULES);
  if (fs.existsSync(EXAMPLE_RULES_PATH)) return readJson(EXAMPLE_RULES_PATH, DEFAULT_RULES);
  return { ...DEFAULT_RULES };
}

function loadLists() {
  const textById = {};
  houseFilter.LIST_IDS.forEach((id) => {
    const filePath = path.join(LIST_DIR, `${id}.txt`);
    textById[id] = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  });
  rules = loadRules();
  blockSet = houseFilter.buildBlockSet(textById, rules);
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

function remember(name, action, listHint) {
  stats.recent.unshift({ at: Date.now(), name, action, listHint });
  stats.recent = stats.recent.slice(0, 40);
}

function shouldBlock(name) {
  return houseFilter.matchesDomain(name, blockSet);
}

function startDns() {
  const server = dgram.createSocket("udp4");
  server.on("message", (msg, rinfo) => {
    stats.queries += 1;
    const { name, type } = questionType(msg);
    if (name && shouldBlock(name)) {
      stats.blocked += 1;
      remember(name, "block", "house-list");
      const reply = buildBlockResponse(msg, name, type);
      server.send(reply, rinfo.port, rinfo.address);
      return;
    }
    stats.forwarded += 1;
    const upstream = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      try {
        upstream.close();
      } catch {
        /* ignore */
      }
    }, 2500);
    upstream.on("message", (reply) => {
      clearTimeout(timer);
      server.send(reply, rinfo.port, rinfo.address);
      try {
        upstream.close();
      } catch {
        /* ignore */
      }
    });
    upstream.on("error", () => {
      clearTimeout(timer);
      try {
        upstream.close();
      } catch {
        /* ignore */
      }
    });
    upstream.send(msg, 53, UPSTREAM);
  });
  server.on("error", (err) => {
    console.error("DNS filter could not start:", err.message);
    if (String(err.message).includes("EACCES") || DNS_PORT === 53) {
      console.error("Port 53 needs Administrator (Windows) or sudo (macOS/Linux).");
      console.error("Or test with: PRIVACY_DNS_PORT=5353 npm run privacy-dns");
    }
    process.exit(1);
  });
  server.bind(DNS_PORT, "0.0.0.0", () => {
    const ips = lanAddresses();
    console.log(`Privacy Agent DNS filter on UDP ${DNS_PORT}`);
    console.log(`Upstream ${UPSTREAM}`);
    console.log(`House rules: shopping=${rules.shopping} health=${rules.health}`);
    console.log(`Blocking ${blockSet.size} domains`);
    if (ips.length) {
      console.log("Set router DNS to one of these LAN addresses:");
      ips.forEach((ip) => console.log(`  ${ip}`));
    }
    console.log(`Status: http://127.0.0.1:${HTTP_PORT}  or  http://LAN-IP:${HTTP_PORT}`);
  });
}

function isLocalRequest(req) {
  const raw = String(req.socket.remoteAddress || "");
  return raw === "127.0.0.1" || raw === "::1" || raw === ":ffff:127.0.0.1";
}

function send(res, status, body, type) {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": payload.length,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function statusPage() {
  const ips = lanAddresses();
  const recent = stats.recent
    .slice(0, 12)
    .map((item) => `<li><strong>${item.action}</strong> ${item.name}</li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Agent house filter</title>
  <style>
    body { font-family: Outfit, system-ui, sans-serif; background: #f7f6f3; color: #1c1b19; margin: 0; padding: 32px; }
    main { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 20px; padding: 28px; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    p, li { line-height: 1.5; color: #5c5852; }
    code { background: #f3f1ec; padding: 2px 6px; border-radius: 6px; }
    ul { padding-left: 18px; }
  </style>
</head>
<body>
  <main>
    <h1>Privacy Agent house filter</h1>
    <p>This computer is the DNS filter for the house. Point the router at <code>${ips[0] || "this LAN IP"}</code>.</p>
    <p>Queries ${stats.queries} · Blocked ${stats.blocked} · Forwarded ${stats.forwarded} · ${blockSet.size} domains</p>
    <p>Rules: shopping ${rules.shopping}, health ${rules.health}</p>
    <ul>${recent || "<li>No blocks yet. Browse from a phone on this Wi-Fi after you change router DNS.</li>"}</ul>
  </main>
</body>
</html>`;
}

function startHttp() {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      send(res, 204, "", "text/plain; charset=utf-8");
      return;
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, statusPage(), "text/html; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/status.json") {
      send(
        res,
        200,
        JSON.stringify({
          ok: true,
          rules,
          lists: houseFilter.enabledLists(rules),
          domains: blockSet.size,
          stats: { queries: stats.queries, blocked: stats.blocked, forwarded: stats.forwarded },
          recent: stats.recent.slice(0, 20),
          lan: lanAddresses(),
          dnsPort: DNS_PORT,
        }),
        "application/json; charset=utf-8"
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/lists/hosts.txt") {
      send(res, 200, `${houseFilter.hostsFile(blockSet)}\n`, "text/plain; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/lists/domains.txt") {
      send(res, 200, `${houseFilter.domainFile(blockSet)}\n`, "text/plain; charset=utf-8");
      return;
    }
    if (req.method === "POST" && url.pathname === "/rules") {
      if (!isLocalRequest(req)) {
        send(res, 403, JSON.stringify({ ok: false, error: "Rules can only be updated from this computer." }), "application/json; charset=utf-8");
        return;
      }
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const next = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const clean = {
            shopping: next.shopping === "never" ? "never" : "ok_for_discounts",
            health: next.health === "allow" ? "allow" : "never",
            identity: next.identity === "vault_only" ? "vault_only" : "checkout_ok",
          };
          fs.writeFileSync(RULES_PATH, `${JSON.stringify(clean, null, 2)}\n`);
          loadLists();
          send(res, 200, JSON.stringify({ ok: true, rules, domains: blockSet.size }), "application/json; charset=utf-8");
        } catch {
          send(res, 400, JSON.stringify({ ok: false, error: "Invalid rules JSON." }), "application/json; charset=utf-8");
        }
      });
      return;
    }
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  });
  server.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log(`House filter status on http://0.0.0.0:${HTTP_PORT}`);
  });
}

loadLists();
startHttp();
startDns();
