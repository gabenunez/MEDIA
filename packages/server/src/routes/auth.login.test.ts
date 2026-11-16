import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { ConfigManager } from "../config.js";
import type { AuthService } from "../services/auth.js";
import { LOGIN_FAILURE_LIMIT } from "../services/login-rate-limit.js";
import { TRUSTED_PROXIES } from "../utils/network.js";
import { authRoutes } from "./auth.js";

function fakeAuth(password = "correct-horse"): AuthService {
  return {
    isPasswordRequired: () => true,
    verifyPassword: (value: string) => value === password,
    createSessionToken: () => "session-token",
    allSessionCookies: () => ["media_session=session-token; Path=/; HttpOnly"],
  } as unknown as AuthService;
}

async function loginApp(options: { trustProxy?: string } = {}) {
  const app = Fastify(options);
  await authRoutes(app, fakeAuth(), {} as ConfigManager);
  return app;
}

async function failUntilLocked(
  app: Awaited<ReturnType<typeof loginApp>>,
  request: { remoteAddress: string; headers?: Record<string, string> },
) {
  for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      ...request,
      payload: { password: "nope" },
    });
  }
}

describe("password login lockout behind the local gateway", () => {
  it("gives each forwarded client its own bucket", async () => {
    const app = await loginApp({ trustProxy: TRUSTED_PROXIES });

    // Apache → gateway → Fastify: X-Forwarded-For carries the real client.
    await failUntilLocked(app, {
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.5, 127.0.0.1" },
    });

    const attacker = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.5, 127.0.0.1" },
      payload: { password: "correct-horse" },
    });
    expect(attacker.statusCode).toBe(429);

    const householdMember = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "198.51.100.8, 127.0.0.1" },
      payload: { password: "correct-horse" },
    });
    expect(householdMember.statusCode).toBe(200);

    await app.close();
  });

  it("keeps the gateway-appended address when a client spoofs X-Forwarded-For", async () => {
    const app = await loginApp({ trustProxy: TRUSTED_PROXIES });

    // A direct client sends a fake header; the gateway appends its real address.
    await failUntilLocked(app, {
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "198.51.100.8, 203.0.113.5" },
    });

    const spoofedVictim = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "198.51.100.8" },
      payload: { password: "correct-horse" },
    });
    expect(spoofedVictim.statusCode).toBe(200);

    await app.close();
  });

  it("ignores X-Forwarded-For from non-loopback sockets", async () => {
    const app = await loginApp({ trustProxy: TRUSTED_PROXIES });

    // Rotating the header from a remote socket must not escape the lockout.
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: "203.0.113.5",
        headers: { "x-forwarded-for": `198.51.100.${attempt}` },
        payload: { password: "nope" },
      });
    }

    const rotated = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "203.0.113.5",
      headers: { "x-forwarded-for": "198.51.100.200" },
      payload: { password: "correct-horse" },
    });
    expect(rotated.statusCode).toBe(429);

    await app.close();
  });
});

describe("password login lockout", () => {
  it("locks a client after 10 failures and still rejects the right password", async () => {
    const app = await loginApp();

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      const wrong = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: "203.0.113.5",
        payload: { password: "nope" },
      });
      expect(wrong.statusCode).toBe(attempt === LOGIN_FAILURE_LIMIT - 1 ? 429 : 401);
    }

    const locked = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "203.0.113.5",
      payload: { password: "correct-horse" },
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.json()).toEqual({
      error: "Too many attempts. Try again in 15 minutes.",
    });
    expect(locked.headers["retry-after"]).toBe("900");

    const otherClient = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "203.0.113.6",
      payload: { password: "correct-horse" },
    });
    expect(otherClient.statusCode).toBe(200);
    expect(otherClient.json()).toMatchObject({ success: true, token: "session-token" });

    await app.close();
  });

  it("clears the failure count after a successful login", async () => {
    const app = await loginApp();

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT - 1; attempt += 1) {
      const wrong = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: "198.51.100.8",
        payload: { password: "nope" },
      });
      expect(wrong.statusCode).toBe(401);
    }

    const success = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: "198.51.100.8",
      payload: { password: "correct-horse" },
    });
    expect(success.statusCode).toBe(200);

    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT - 1; attempt += 1) {
      const wrong = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: "198.51.100.8",
        payload: { password: "nope" },
      });
      expect(wrong.statusCode).toBe(401);
    }

    await app.close();
  });
});
