import { describe, expect, it } from "vitest";
import { isPublicPath } from "./auth.js";

describe("public authentication paths", () => {
  it("keeps health and artwork public but protects detailed status when a password is configured", () => {
    expect(isPublicPath("/api/health", true)).toBe(true);
    expect(isPublicPath("/api/images/w500_abc.jpg", true)).toBe(true);
    expect(isPublicPath("/api/status", true)).toBe(false);
    expect(isPublicPath("/api/auth/status", true)).toBe(true);
    expect(isPublicPath("/api/auth/login", true)).toBe(true);
  });
});
