import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../services/auth.js";
import type { ConfigManager } from "../config.js";
import {
  LoginRateLimiter,
  loginClientKey,
  loginLockoutMessage,
} from "../services/login-rate-limit.js";

const MAX_PASSWORD_LENGTH = 1024;

function rejectLocked(reply: FastifyReply, retryAfterSeconds: number) {
  reply.header("Retry-After", String(retryAfterSeconds));
  return reply.status(429).send({ error: loginLockoutMessage(retryAfterSeconds) });
}

export async function authRoutes(
  app: FastifyInstance,
  auth: AuthService,
  configManager: ConfigManager,
  loginAttempts = new LoginRateLimiter(),
) {
  app.get("/api/auth/status", async (request) => {
    const required = auth.isPasswordRequired();
    const publicPrefix = configManager.get().server.public_prefix ?? "";
    return {
      required,
      authenticated: auth.isAuthenticated(request),
      // Android TV uses this to persist a server URL that includes basePath.
      publicPrefix,
    };
  });

  app.post<{ Body: { password?: string } }>(
    "/api/auth/login",
    async (request, reply) => {
      if (!auth.isPasswordRequired()) {
        return { success: true };
      }

      const client = loginClientKey(request.ip);
      const gate = loginAttempts.check(client);
      if (gate.blocked) {
        return rejectLocked(reply, gate.retryAfterSeconds);
      }

      const password = (request.body?.password ?? "").trim();
      const passwordOk =
        password.length > 0 &&
        password.length <= MAX_PASSWORD_LENGTH &&
        auth.verifyPassword(password);
      if (!passwordOk) {
        const failure = loginAttempts.recordFailure(client);
        if (failure.blocked) {
          return rejectLocked(reply, failure.retryAfterSeconds);
        }
        return reply.status(401).send({ error: "Invalid password" });
      }

      loginAttempts.recordSuccess(client);

      const token = auth.createSessionToken();
      reply.header("Set-Cookie", auth.allSessionCookies(token));
      // Native TV pairing reads this when HttpURLConnection drops Set-Cookie headers.
      return { success: true, token };
    },
  );

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.header("Set-Cookie", auth.clearAllSessionCookies());
    return { success: true };
  });

  app.put<{
    Body: { password?: string; currentPassword?: string; remove?: boolean };
  }>("/api/settings/password", async (request, reply) => {
    const required = auth.isPasswordRequired();
    const { password = "", currentPassword = "", remove = false } =
      request.body ?? {};

    if (required) {
      if (!auth.isAuthenticated(request)) {
        return reply.status(401).send({ error: "Authentication required" });
      }
      if (
        !currentPassword ||
        currentPassword.length > MAX_PASSWORD_LENGTH ||
        !auth.verifyPassword(currentPassword)
      ) {
        return reply.status(401).send({ error: "Current password is incorrect" });
      }
    }

    if (remove) {
      auth.clearPassword();
      reply.header("Set-Cookie", auth.clearAllSessionCookies());
      return { success: true, passwordConfigured: false };
    }

    if (!password.trim()) {
      return reply.status(400).send({ error: "Password is required" });
    }
    if (password.length < 4) {
      return reply.status(400).send({ error: "Password must be at least 4 characters" });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return reply.status(400).send({ error: "Password is too long" });
    }

    auth.setPassword(password);
    const token = auth.createSessionToken();
    reply.header("Set-Cookie", auth.allSessionCookies(token));

    return { success: true, passwordConfigured: true };
  });
}
