import { describe, expect, it } from "vitest";
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_LOCKOUT_MS,
  LoginRateLimiter,
  loginClientKey,
  loginLockoutMessage,
} from "./login-rate-limit.js";

describe("login client key", () => {
  it("groups loopback addresses and ignores a missing address", () => {
    expect(loginClientKey("127.0.0.1")).toBe("loopback");
    expect(loginClientKey("::1")).toBe("loopback");
    expect(loginClientKey("::ffff:127.0.0.1")).toBe("loopback");
    expect(loginClientKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(loginClientKey("  ")).toBe("unknown");
    expect(loginClientKey(undefined)).toBe("unknown");
  });
});

describe("login lockout", () => {
  it("blocks a client after 10 failures and leaves other clients alone", () => {
    let now = 1_000_000;
    const limiter = new LoginRateLimiter(() => now);

    for (let attempt = 1; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      expect(limiter.recordFailure("203.0.113.5").blocked).toBe(false);
    }

    const blocked = limiter.recordFailure("203.0.113.5");
    expect(blocked).toEqual({
      blocked: true,
      retryAfterSeconds: LOGIN_LOCKOUT_MS / 1000,
    });
    expect(limiter.check("203.0.113.5").blocked).toBe(true);
    expect(limiter.recordFailure("203.0.113.6").blocked).toBe(false);
  });

  it("does not extend an active lock and clears it when the window ends", () => {
    let now = 1_000_000;
    const limiter = new LoginRateLimiter(() => now);

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      limiter.recordFailure("tv");
    }

    now += 1_000;
    const stillBlocked = limiter.recordFailure("tv");
    expect(stillBlocked.blocked).toBe(true);
    if (stillBlocked.blocked) {
      expect(stillBlocked.retryAfterSeconds).toBeLessThan(LOGIN_LOCKOUT_MS / 1000);
    }

    now += LOGIN_LOCKOUT_MS;
    expect(limiter.check("tv")).toEqual({ blocked: false });
    expect(limiter.recordFailure("tv").blocked).toBe(false);
  });

  it("forgets failures that are older than the window and resets after success", () => {
    let now = 1_000_000;
    const limiter = new LoginRateLimiter(() => now);

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT - 1; attempt += 1) {
      limiter.recordFailure("phone");
    }

    now += LOGIN_LOCKOUT_MS;
    expect(limiter.recordFailure("phone").blocked).toBe(false);

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT - 1; attempt += 1) {
      limiter.recordFailure("tablet");
    }
    limiter.recordSuccess("tablet");
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT - 1; attempt += 1) {
      expect(limiter.recordFailure("tablet").blocked).toBe(false);
    }
  });

  it("describes the wait in minutes", () => {
    expect(loginLockoutMessage(30)).toBe("Too many attempts. Try again in 1 minute.");
    expect(loginLockoutMessage(15 * 60)).toBe(
      "Too many attempts. Try again in 15 minutes.",
    );
  });
});
