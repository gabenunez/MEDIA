import { afterEach, describe, expect, it, vi } from "vitest";
import { isInternalMediaApiRequest, isPublicPath } from "./auth.js";

describe("public authentication paths", () => {
  it("keeps health and artwork public but protects detailed status when a password is configured", () => {
    expect(isPublicPath("/api/health", true)).toBe(true);
    expect(isPublicPath("/api/images/w500_abc.jpg", true)).toBe(true);
    expect(isPublicPath("/api/status", true)).toBe(false);
    expect(isPublicPath("/api/auth/status", true)).toBe(true);
    expect(isPublicPath("/api/auth/login", true)).toBe(true);
  });
});

describe("internal Next.js API requests", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows SSR/ISR media fetches only with the configured internal token", () => {
    vi.stubEnv("MEDIA_INTERNAL_TOKEN", "test-internal-token");
    expect(
      isInternalMediaApiRequest("/api/media/265", {
        "x-media-internal": "test-internal-token",
      }),
    ).toBe(true);
    expect(
      isInternalMediaApiRequest("/api/media/265", {
        "x-media-internal": "next-isr",
      }),
    ).toBe(false);
    expect(
      isInternalMediaApiRequest("/api/media/265", {
        "x-media-internal": "wrong",
      }),
    ).toBe(false);
    expect(isInternalMediaApiRequest("/api/media/265", {})).toBe(false);
    expect(
      isInternalMediaApiRequest("/api/status", {
        "x-media-internal": "test-internal-token",
      }),
    ).toBe(false);
  });

  it("rejects the internal header when no token is configured", () => {
    vi.stubEnv("MEDIA_INTERNAL_TOKEN", "");
    expect(
      isInternalMediaApiRequest("/api/media/265", {
        "x-media-internal": "next-isr",
      }),
    ).toBe(false);
  });
});
