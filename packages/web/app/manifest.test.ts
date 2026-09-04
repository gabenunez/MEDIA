import { describe, expect, it, vi } from "vitest";

describe("web app manifest", () => {
  it("keeps root paths when no public prefix is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    vi.stubEnv("MEDIA_PUBLIC_PREFIX", "");
    vi.resetModules();
    const { default: manifest } = await import("./manifest");
    const result = manifest();
    expect(result.start_url).toBe("/");
    expect(result.scope).toBe("/");
    expect(result.id).toBe("/");
    expect(result.icons?.[0]?.src).toBe("/icons/icon-192.png");
    vi.unstubAllEnvs();
  });

  it("prefixes start_url, scope, and icons under /reel", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/reel");
    vi.resetModules();
    const { default: manifest } = await import("./manifest");
    const result = manifest();
    expect(result.start_url).toBe("/reel/");
    expect(result.scope).toBe("/reel/");
    expect(result.id).toBe("/reel/");
    expect(result.icons?.map((icon) => icon.src)).toEqual([
      "/reel/icons/icon-192.png",
      "/reel/icons/icon-512.png",
      "/reel/icons/icon-512-maskable.png",
    ]);
    vi.unstubAllEnvs();
  });
});
