import { describe, expect, it } from "vitest";
import {
  isLoginPath,
  resolveAuthStatusUrl,
  resolvePostLoginHref,
  safeInternalPath,
} from "./auth-html-gate";

describe("isLoginPath", () => {
  it("matches the login route with or without a trailing slash", () => {
    expect(isLoginPath("/login")).toBe(true);
    expect(isLoginPath("/login/")).toBe(true);
    expect(isLoginPath("/")).toBe(false);
    expect(isLoginPath("/login/extra")).toBe(false);
  });
});

describe("safeInternalPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeInternalPath("/watch/movie/1/?tv=1")).toBe(
      "/watch/movie/1/?tv=1",
    );
    expect(safeInternalPath("/")).toBe("/");
  });

  it("rejects open redirects and the login route", () => {
    expect(safeInternalPath("https://evil.example/")).toBeNull();
    expect(safeInternalPath("//evil.example")).toBeNull();
    expect(safeInternalPath("/\\evil.example")).toBeNull();
    expect(safeInternalPath("/login/")).toBeNull();
    expect(safeInternalPath("watch/1")).toBeNull();
  });
});

describe("resolvePostLoginHref", () => {
  it("reloads the current catalog URL after a rewrite", () => {
    expect(
      resolvePostLoginHref({
        pathname: "/watch/movie/1/",
        search: "?tv=1",
        isTv: true,
      }),
    ).toBe("/watch/movie/1/?tv=1");
  });

  it("sends a direct /login/ visit home, preserving TV", () => {
    expect(
      resolvePostLoginHref({
        pathname: "/login/",
        search: "?tv=1",
        isTv: false,
      }),
    ).toBe("/?tv=1");
    expect(
      resolvePostLoginHref({
        pathname: "/login/",
        search: "?next=%2Fmedia%2F5%2F",
        isTv: false,
      }),
    ).toBe("/media/5/");
  });
});

describe("resolveAuthStatusUrl", () => {
  it("prefers the internal API URL, then the rewrite port", () => {
    expect(
      resolveAuthStatusUrl({ MEDIA_INTERNAL_API_URL: "http://127.0.0.1:8097/" }),
    ).toBe("http://127.0.0.1:8097/api/auth/status");
    expect(resolveAuthStatusUrl({ MEDIA_INTERNAL_API_PORT: "8096" })).toBe(
      "http://127.0.0.1:8096/api/auth/status",
    );
    expect(resolveAuthStatusUrl({})).toBe("http://127.0.0.1:8097/api/auth/status");
  });
});
