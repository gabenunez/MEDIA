import os from "node:os";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "@media-app/shared";

function isPrivateIpv4(address: string): boolean {
  return (
    address.startsWith("192.168.") ||
    address.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

function isVirtualInterface(name: string): boolean {
  return /^(lo|utun|bridge|awdl|llw|gif|stf|vmnet|vboxnet|docker|br-|tun|tap)/i.test(
    name,
  );
}

export function getLanBaseUrl(port: number): string {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{ name: string; address: string }> = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (isVirtualInterface(name)) continue;
    for (const iface of entries ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }

  const preferred =
    candidates.find(({ name, address }) => name === "en0" && isPrivateIpv4(address)) ??
    candidates.find(({ name, address }) => /^en\d+$/i.test(name) && isPrivateIpv4(address)) ??
    candidates.find(({ address }) => isPrivateIpv4(address)) ??
    candidates.find(({ name }) => /^(en|eth|wlan|wifi)/i.test(name)) ??
    candidates[0];

  const address = preferred?.address ?? "127.0.0.1";
  return `http://${address}:${port}`;
}

function firstHeader(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return firstHeader(value[0]);
  if (typeof value !== "string") return null;
  const token = value.split(",")[0]?.trim();
  return token || null;
}

function hostnameOf(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(1, end);
  }
  return host.split(":")[0] ?? host;
}

function isLoopbackHost(host: string): boolean {
  if (!host) return true;
  const hostname = hostnameOf(host);
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1"
  );
}

function parseHttpOrigin(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isCastReceiverHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "gstatic.com" ||
    host.endsWith(".gstatic.com") ||
    host === "google.com" ||
    host.endsWith(".google.com") ||
    host.endsWith(".youtube.com") ||
    host.endsWith(".googleusercontent.com")
  );
}

/** Public browser origin Chromecast should fetch — never localhost or the Cast receiver. */
export function publicOriginFromHeader(value: string | null): string | null {
  const parsed = parseHttpOrigin(value);
  if (!parsed || isLoopbackHost(parsed.host)) return null;
  if (isCastReceiverHostname(parsed.hostname)) return null;
  return parsed.origin;
}

/**
 * Base URL Chromecast uses to fetch streams.
 *
 * Prefer the sender page origin (HTTPS behind Apache/nginx) over
 * x-forwarded-proto. Next rewrites /api to Fastify over HTTP and often
 * overwrites proto to `http`, which makes Chromecast's HTTPS receiver
 * refuse the media (mixed content → session_error).
 *
 * Ignore Origin from the Cast receiver itself (gstatic) so HLS segment
 * URLs are not rewritten onto Google's domain.
 */
export function getCastBaseUrl(
  request: FastifyRequest,
  config: AppConfig,
  senderOrigin?: string,
): string {
  const fromSender = publicOriginFromHeader(senderOrigin ?? null);
  if (fromSender) {
    return withPublicPrefix(config, fromSender);
  }

  const fromOrigin = publicOriginFromHeader(firstHeader(request.headers.origin));
  if (fromOrigin) {
    return withPublicPrefix(config, fromOrigin);
  }

  const fromReferer = publicOriginFromHeader(firstHeader(request.headers.referer));
  if (fromReferer) {
    return withPublicPrefix(config, fromReferer);
  }

  const forwardedHost = firstHeader(request.headers["x-forwarded-host"]);
  const host = forwardedHost ?? request.headers.host ?? "";
  if (isLoopbackHost(host)) {
    return withPublicPrefix(config, getLanBaseUrl(config.server.port));
  }

  const forwarded = firstHeader(request.headers.forwarded);
  const forwardedProto =
    firstHeader(request.headers["x-forwarded-proto"]) ??
    forwarded?.match(/(?:^|[;\s])proto=([^;,\s]+)/i)?.[1] ??
    (firstHeader(request.headers["x-forwarded-ssl"]) === "on" ? "https" : null);

  const protocol = forwardedProto ?? request.protocol ?? "http";
  return withPublicPrefix(config, `${protocol}://${host}`);
}

/** Prefix an origin or path with server.public_prefix (e.g. /reel). */
export function withPublicPrefix(config: AppConfig, value: string): string {
  const prefix = normalizePublicPrefix(config.server.public_prefix);
  if (!prefix) return value;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value);
    if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
      return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
    }
    const path = url.pathname === "/" ? prefix : `${prefix}${url.pathname}`;
    return `${url.origin}${path}`;
  }

  const normalized = value.startsWith("/") ? value : `/${value}`;
  if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
    return normalized;
  }
  return normalized === "/" ? `${prefix}/` : `${prefix}${normalized}`;
}

function normalizePublicPrefix(value: string | undefined): string {
  if (!value || value === "/") return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function toAbsoluteUrl(baseUrl: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function appendQueryParam(
  url: string,
  key: string,
  value: string,
): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}
