import { describe, expect, it, vi } from "vitest";

describe("base path helpers", () => {
  it("prefixes app paths when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/reel");
    const { withBasePath, stripBasePath } = await import("./base-path");
    expect(withBasePath("/media/5/")).toBe("/reel/media/5/");
    expect(withBasePath("/")).toBe("/reel/");
    expect(stripBasePath("/reel/media/5/")).toBe("/media/5/");
    expect(stripBasePath("/reel")).toBe("/");
    vi.unstubAllEnvs();
  });
});
