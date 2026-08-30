#!/usr/bin/env node
"use strict";

const http = require("http");
const { createRuntime, lanAddresses } = require("./lib");

const DNS_PORT = Number(process.env.PRIVACY_DNS_PORT || 53);
const HTTP_PORT = Number(process.env.PRIVACY_DNS_HTTP_PORT || 8787);
const runtime = createRuntime();

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

function startHttp() {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      send(res, 204, "", "text/plain; charset=utf-8");
      return;
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const snapshot = runtime.status();
    if (req.method === "GET" && url.pathname === "/") {
      const ip = (snapshot.lan && snapshot.lan[0]) || "this LAN IP";
      const recent = (snapshot.recent || [])
        .slice(0, 12)
        .map((item) => `<li><strong>${item.action}</strong> ${item.name}</li>`)
        .join("");
      send(
        res,
        200,
        `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Privacy Agent house filter</title></head><body><h1>Privacy Agent house filter</h1><p>Point the router at <code>${ip}</code>.</p><p>Queries ${snapshot.stats.queries} · Blocked ${snapshot.stats.blocked}</p><ul>${recent}</ul></body></html>`,
        "text/html; charset=utf-8"
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/status.json") {
      send(res, 200, JSON.stringify(snapshot), "application/json; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/lists/hosts.txt") {
      send(res, 200, runtime.hostsText(), "text/plain; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/lists/domains.txt") {
      send(res, 200, runtime.domainsText(), "text/plain; charset=utf-8");
      return;
    }
    if (req.method === "POST" && url.pathname === "/rules") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const next = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          send(res, 200, JSON.stringify(runtime.setRules(next)), "application/json; charset=utf-8");
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

if (require.main === module) {
  runtime
    .start({ port: DNS_PORT })
    .then((snapshot) => {
      console.log(`Privacy Agent DNS filter on UDP ${snapshot.dnsPort}`);
      console.log(`Blocking ${snapshot.domains} domains`);
      const ips = lanAddresses();
      if (ips.length) {
        console.log("Set router DNS to one of these LAN addresses:");
        ips.forEach((ip) => console.log(`  ${ip}`));
      }
      startHttp();
    })
    .catch((err) => {
      console.error("DNS filter could not start:", err.message);
      if (String(err.message).includes("EACCES") || DNS_PORT === 53) {
        console.error("Port 53 needs Administrator (Windows) or sudo (macOS/Linux).");
        console.error("Prefer opening Privacy Agent in the Hub app and tapping Protect this house.");
        console.error("Or test with: PRIVACY_DNS_PORT=5353 npm run privacy-dns");
      }
      process.exit(1);
    });
}

module.exports = { runtime };
