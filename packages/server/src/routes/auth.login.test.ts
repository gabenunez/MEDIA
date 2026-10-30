import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { ConfigManager } from "../config.js";
import type { AuthService } from "../services/auth.js";
import { LOGIN_FAILURE_LIMIT } from "../services/login-rate-limit.js";
import { authRoutes } from "./auth.js";

function fakeAuth(password = "correct-horse"): AuthService {
  return {
    isPasswordRequired: () => true,
    verifyPassword: (value: string) => value === password,
    createSessionToken: () => "session-token",
    allSessionCookies: () => ["media_session=session-token; Path=/; HttpOnly"],
  } as unknown as AuthService;
}

async function loginApp() {
  const app = Fastify();
  await authRoutes(app, fakeAuth(), {} as ConfigManager);
  return app;
}

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
