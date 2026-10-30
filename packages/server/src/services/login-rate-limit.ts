export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export type LoginAttempt =
  | { blocked: false }
  | { blocked: true; retryAfterSeconds: number };

type Bucket = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

/** Collapse proxy loopback addresses so web and TV share one login bucket. */
export function loginClientKey(ip: string | undefined | null): string {
  const value = ip?.trim() ?? "";
  if (!value) return "unknown";
  if (value === "::1" || value === "127.0.0.1" || value === "::ffff:127.0.0.1") {
    return "loopback";
  }
  if (value.startsWith("::ffff:")) return value.slice("::ffff:".length);
  return value;
}

export function loginLockoutMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const unit = minutes === 1 ? "minute" : "minutes";
  return `Too many attempts. Try again in ${minutes} ${unit}.`;
}

/**
 * In-memory login lockout. Ten failures inside the window block that client
 * for the same duration. A restart clears the counters.
 */
export class LoginRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private now: () => number = Date.now,
    private limit = LOGIN_FAILURE_LIMIT,
    private lockoutMs = LOGIN_LOCKOUT_MS,
  ) {}

  check(key: string): LoginAttempt {
    const bucket = this.active(key, this.now());
    if (!bucket || bucket.blockedUntil <= this.now()) return { blocked: false };
    return this.blocked(bucket, this.now());
  }

  recordFailure(key: string): LoginAttempt {
    const now = this.now();
    this.prune(now);
    const current = this.active(key, now);
    if (current && current.blockedUntil > now) return this.blocked(current, now);

    const bucket: Bucket = current ?? {
      failures: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    };
    bucket.failures += 1;
    if (bucket.failures >= this.limit) {
      bucket.failures = 0;
      bucket.windowStartedAt = now;
      bucket.blockedUntil = now + this.lockoutMs;
    }
    this.buckets.set(key, bucket);
    if (bucket.blockedUntil > now) return this.blocked(bucket, now);
    return { blocked: false };
  }

  recordSuccess(key: string): void {
    this.buckets.delete(key);
  }

  private active(key: string, now: number): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (!bucket) return undefined;
    if (bucket.blockedUntil > now) return bucket;
    if (now - bucket.windowStartedAt >= this.lockoutMs) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  private blocked(bucket: Bucket, now: number): LoginAttempt {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
    };
  }

  private prune(now: number): void {
    if (this.buckets.size < 1024) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.blockedUntil <= now && now - bucket.windowStartedAt >= this.lockoutMs) {
        this.buckets.delete(key);
      }
    }
  }
}
