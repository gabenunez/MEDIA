import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigManager } from "../config.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MetadataService } from "./metadata.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeService } from "./themes.js";

describe("ThemeService.shouldAttemptSync", () => {
  let tmpDir: string;
  let service: ThemeService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "theme-"));
    const configManager = {
      get: () => ({ data_dir: tmpDir, metadata: {} }),
    } as unknown as ConfigManager;
    service = new ThemeService(
      {} as DatabaseInstance,
      configManager,
      {} as MetadataService,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("attempts when a title has never been checked", () => {
    expect(
      service.shouldAttemptSync({ themePath: null, themeCheckedAt: null }),
    ).toBe(true);
  });

  it("does NOT re-attempt a recently-checked theme-less title", () => {
    // This is the hot-path optimization: theme-less titles must not re-run the
    // remote fetch chain on every request.
    expect(
      service.shouldAttemptSync({
        themePath: null,
        themeCheckedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("re-attempts once the recheck window has elapsed", () => {
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(
      service.shouldAttemptSync({ themePath: null, themeCheckedAt: longAgo }),
    ).toBe(true);
  });

  it("never attempts when a cached theme file already exists", () => {
    const themeFile = path.join(tmpDir, "theme.mp3");
    fs.writeFileSync(themeFile, "x");
    expect(
      service.shouldAttemptSync({
        themePath: themeFile,
        themeCheckedAt: null,
      }),
    ).toBe(false);
  });

  it("attempts when themePath points at a file that no longer exists", () => {
    expect(
      service.shouldAttemptSync({
        themePath: path.join(tmpDir, "gone.mp3"),
        themeCheckedAt: null,
      }),
    ).toBe(true);
  });
});
