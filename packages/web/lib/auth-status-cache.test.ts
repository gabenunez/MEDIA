import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_STATUS_CACHE_TTL_MS,
  getCachedAuthStatus,
  peekAuthStatusCache,
  resetAuthStatusCache,
} from "./auth-status-cache";

describe("getCachedAuthStatus", () => {
  afterEach(() => {
    resetAuthStatusCache();
  });

  it("reuses a fresh result for the same cookie", async () => {
    const fetcher = vi.fn(async () => ({
      required: true,
      authenticated: true,
    }));

    await expect(getCachedAuthStatus("session=a", fetcher)).resolves.toEqual({
      required: true,
      authenticated: true,
    });
    await expect(getCachedAuthStatus("session=a", fetcher)).resolves.toEqual({
      required: true,
      authenticated: true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not share cache entries across cookies", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ required: true, authenticated: true })
      .mockResolvedValueOnce({ required: true, authenticated: false });

    await getCachedAuthStatus("session=a", fetcher);
    await expect(getCachedAuthStatus("session=b", fetcher)).resolves.toEqual({
      required: true,
      authenticated: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("expires after the short TTL", async () => {
    const fetcher = vi.fn(async () => ({
      required: false,
      authenticated: false,
    }));
    const now = 1_000_000;
    await getCachedAuthStatus("session=a", fetcher, now);
    expect(peekAuthStatusCache("session=a", now + AUTH_STATUS_CACHE_TTL_MS)).toBeNull();
    await getCachedAuthStatus(
      "session=a",
      fetcher,
      now + AUTH_STATUS_CACHE_TTL_MS + 1,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
