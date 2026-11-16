import { describe, expect, it } from "vitest";
import { apiRequestHeaders, normalizePublicPrefix, resolveRoute } from "./public-gateway.mjs";

const withPrefix = { publicPrefix: "/reel", apiEnabled: true };

describe("normalizePublicPrefix", () => {
  it("normalizes slashes and empty values", () => {
    expect(normalizePublicPrefix("reel/")).toBe("/reel");
    expect(normalizePublicPrefix("/reel")).toBe("/reel");
    expect(normalizePublicPrefix("/")).toBe("");
    expect(normalizePublicPrefix(undefined)).toBe("");
  });
});

describe("resolveRoute", () => {
  it("redirects the origin root into the prefix, keeping the query", () => {
    expect(resolveRoute("/?a=1", withPrefix)).toEqual({
      kind: "redirect",
      location: "/reel/?a=1",
    });
  });

  it("sends prefixed API calls to Fastify without the prefix", () => {
    expect(resolveRoute("/reel/api/stream/12?type=movie&castToken=a%2Bb", withPrefix)).toEqual({
      kind: "api",
      path: "/api/stream/12?type=movie&castToken=a%2Bb",
    });
    expect(resolveRoute("/reel/api", withPrefix)).toEqual({ kind: "api", path: "/api" });
  });

  it("keeps unprefixed /api reachable for Android TV pairing", () => {
    expect(resolveRoute("/api/auth/status", withPrefix)).toEqual({
      kind: "api",
      path: "/api/auth/status",
    });
  });

  it("leaves pages, Next assets, and look-alike paths on Next", () => {
    for (const url of [
      "/reel/",
      "/reel/media/12/",
      "/reel/_next/image?url=%2Fapi%2Fimages%2Fa.jpg&w=640&q=75",
      "/reel/internal/revalidate/",
      "/reel/apix",
      "/reel/api-docs",
      "/apix",
      "/other/api/health",
    ]) {
      expect(resolveRoute(url, withPrefix)).toEqual({ kind: "web", path: url });
    }
  });

  it("keeps the old all-to-Next behavior when no API port is configured", () => {
    expect(resolveRoute("/reel/api/health", { publicPrefix: "/reel" })).toEqual({
      kind: "web",
      path: "/reel/api/health",
    });
  });
});

describe("apiRequestHeaders", () => {
  const req = (headers, socket = { remoteAddress: "192.168.1.20" }) => ({ headers, socket });

  it("fills forwarded headers for direct LAN clients", () => {
    const out = apiRequestHeaders(req({ host: "10.0.0.8:8096", connection: "keep-alive" }));
    expect(out["x-forwarded-host"]).toBe("10.0.0.8:8096");
    expect(out["x-forwarded-proto"]).toBe("http");
    expect(out["x-forwarded-for"]).toBe("192.168.1.20");
    expect(out.connection).toBeUndefined();
  });

  it("keeps what an outer HTTPS proxy already set", () => {
    const out = apiRequestHeaders(
      req(
        {
          host: "127.0.0.1:8096",
          "x-forwarded-host": "media.example.com",
          "x-forwarded-proto": "https",
          "x-forwarded-for": "203.0.113.5",
        },
        { remoteAddress: "127.0.0.1" },
      ),
    );
    expect(out["x-forwarded-host"]).toBe("media.example.com");
    expect(out["x-forwarded-proto"]).toBe("https");
    expect(out["x-forwarded-for"]).toBe("203.0.113.5, 127.0.0.1");
  });
});
