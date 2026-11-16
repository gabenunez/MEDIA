#!/usr/bin/env node
/**
 * Public front door when MEDIA_PUBLIC_PREFIX is set.
 * - Redirects / → {prefix}/ (preserves query string)
 * - Sends {prefix}/api/* and unprefixed /api/* (Android TV pairing) straight to
 *   Fastify when MEDIA_API_UPSTREAM_PORT is set, so stream/HLS bytes skip the
 *   Next rewrite proxy
 * - Proxies everything else to the Next standalone server on 127.0.0.1
 *
 * Must not impose request timeouts: stream/HLS traffic also flows through here.
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

const DROP_REQUEST_HEADERS = new Set(["connection", "keep-alive", "proxy-connection"]);
const DROP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  // Node will set these appropriately when piping the upstream body.
  "transfer-encoding",
]);

export function normalizePublicPrefix(value) {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Decide where a request goes.
 * Works on the raw request URL so query strings and percent-encoding reach
 * the upstream exactly as the client sent them.
 *
 * @returns {{ kind: "redirect", location: string }
 *   | { kind: "api", path: string }
 *   | { kind: "web", path: string }}
 */
export function resolveRoute(rawUrl, { publicPrefix = "", apiEnabled = false } = {}) {
  const url = rawUrl || "/";
  const queryIndex = url.indexOf("?");
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : url.slice(queryIndex);

  if (publicPrefix && (pathname === "/" || pathname === "")) {
    return { kind: "redirect", location: `${publicPrefix}/${search}` };
  }

  if (apiEnabled) {
    if (publicPrefix && pathname.startsWith(`${publicPrefix}/`)) {
      // Fastify routes live at /api/*; Next's rewrite dropped the basePath too.
      const unprefixed = pathname.slice(publicPrefix.length);
      if (isApiPath(unprefixed)) {
        return { kind: "api", path: `${unprefixed}${search}` };
      }
    } else if (isApiPath(pathname)) {
      return { kind: "api", path: url };
    }
  }

  return { kind: "web", path: url };
}

function filterHeaders(source, drop) {
  /** @type {Record<string, string | string[] | undefined>} */
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (drop.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Headers for the direct Fastify hop. Keep whatever an outer Apache/nginx
 * already set (Chromecast needs its https proto and public host); fill the
 * gaps for direct LAN clients the way Next's rewrite proxy used to.
 */
export function apiRequestHeaders(req) {
  const headers = filterHeaders(req.headers, DROP_REQUEST_HEADERS);
  if (!headers["x-forwarded-host"] && req.headers.host) {
    headers["x-forwarded-host"] = req.headers.host;
  }
  if (!headers["x-forwarded-proto"]) {
    headers["x-forwarded-proto"] = req.socket?.encrypted ? "https" : "http";
  }
  const remote = req.socket?.remoteAddress;
  if (remote) {
    const prior = headers["x-forwarded-for"];
    headers["x-forwarded-for"] = prior ? `${prior}, ${remote}` : remote;
  }
  return headers;
}

function proxy(req, res, { port, path, headers }) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path,
      method: req.method,
      // Keep transfer-encoding / content-length so chunked POST bodies stay valid.
      headers,
      timeout: 0,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, filterHeaders(upRes.headers, DROP_RESPONSE_HEADERS));
      upRes.pipe(res);
    },
  );

  upstream.on("timeout", () => {
    upstream.destroy(new Error("upstream timeout"));
  });

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end(`Bad gateway: ${err.message}`);
  });

  req.on("aborted", () => {
    upstream.destroy();
  });
  res.on("close", () => {
    if (!res.writableEnded) upstream.destroy();
  });

  req.pipe(upstream);
}

export function createGateway({ webPort, apiPort, publicPrefix = "" }) {
  const apiEnabled = Number.isFinite(apiPort) && apiPort > 0;

  const server = http.createServer((req, res) => {
    const route = resolveRoute(req.url, { publicPrefix, apiEnabled });

    if (route.kind === "redirect") {
      res.writeHead(302, { Location: route.location, "Cache-Control": "no-store" });
      res.end();
      return;
    }

    if (route.kind === "api") {
      proxy(req, res, { port: apiPort, path: route.path, headers: apiRequestHeaders(req) });
      return;
    }

    proxy(req, res, {
      port: webPort,
      path: route.path,
      headers: filterHeaders(req.headers, DROP_REQUEST_HEADERS),
    });
  });

  // Node 18+ defaults requestTimeout to 5 minutes — that would kill movie streams.
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
  server.keepAliveTimeout = 65_000;

  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const publicPort = Number(process.env.MEDIA_GATEWAY_PORT || process.env.PORT || "8096");
  const webPort = Number(process.env.MEDIA_WEB_UPSTREAM_PORT || "8098");
  const apiPort = Number(process.env.MEDIA_API_UPSTREAM_PORT || "");
  const host = process.env.MEDIA_HOST || "0.0.0.0";
  const publicPrefix = normalizePublicPrefix(process.env.MEDIA_PUBLIC_PREFIX);

  createGateway({ webPort, apiPort, publicPrefix }).listen(publicPort, host, () => {
    const apiNote = apiPort > 0 ? `, /api → 127.0.0.1:${apiPort}` : "";
    console.log(
      `MEDIA! gateway on http://${host}:${publicPort} → 127.0.0.1:${webPort}${apiNote}` +
        (publicPrefix ? ` (root → ${publicPrefix}/)` : ""),
    );
  });
}
