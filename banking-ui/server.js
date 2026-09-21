/**
 * Meridian UI — static file server + API proxy to local gateway (8080)
 * Usage: node server.js
 * Open:  http://localhost:3000
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const UI_PORT = Number(process.env.UI_PORT || 3000);
const API_TARGET = process.env.API_URL || "http://localhost:8080";
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function proxy(req, res) {
  const target = new URL(req.url, API_TARGET);
  const headers = { ...req.headers, host: target.host };
  delete headers["accept-encoding"];

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (up) => {
      const outHeaders = { ...up.headers };
      // Avoid double compression issues in browsers
      delete outHeaders["content-encoding"];
      delete outHeaders["transfer-encoding"];
      res.writeHead(up.statusCode || 502, outHeaders);
      up.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    send(
      res,
      502,
      JSON.stringify({
        error: "Gateway unreachable",
        detail: err.message,
        hint: "Start backend with start-all.ps1 (API on :8080)",
      }),
      { "Content-Type": "application/json" }
    );
  });

  req.pipe(upstream);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, "Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { "Content-Type": MIME[ext] || "application/octet-stream" });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url.startsWith("/actuator/")) {
    return proxy(req, res);
  }
  return serveStatic(req, res);
});

server.listen(UI_PORT, () => {
  console.log(`Meridian UI  → http://localhost:${UI_PORT}`);
  console.log(`API proxy    → ${API_TARGET}`);
});
