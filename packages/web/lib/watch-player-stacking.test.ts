import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function sliceAfter(source: string, marker: string, length = 3500): string {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, start + length);
}

describe("web watch player stacking", () => {
  const client = readFileSync(path.join(webRoot, "app/watch/client.tsx"), "utf8");
  const backdrop = readFileSync(
    path.join(webRoot, "components/playback-poster-backdrop.tsx"),
    "utf8",
  );
  const cues = readFileSync(
    path.join(webRoot, "components/web-subtitle-cue-overlay.tsx"),
    "utf8",
  );
  const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
  const shell = sliceAfter(client, 'data-watch-player=""');

  it("owns a stacking context above page chrome", () => {
    expect(shell).toContain('className="fixed inset-0 z-50 isolate bg-black"');
    expect(css).toContain("[data-watch-player] {\n    isolation: isolate;");
  });

  it("keeps poster under video inside a dedicated stage", () => {
    expect(shell).toContain('data-watch-video-stage=""');
    expect(shell.indexOf("data-watch-video-stage")).toBeLessThan(shell.indexOf("<video"));
    expect(shell.indexOf("PlaybackPosterBackdrop")).toBeLessThan(shell.indexOf("<video"));
    expect(backdrop).toContain("absolute inset-0 z-[1]");
    expect(shell).toContain("z-[2] h-full w-full");
  });

  it("stacks cues < desktop buffering < chrome < status < menus", () => {
    expect(cues).toContain("z-[15]");
    expect(css).toContain("[data-watch-player] .watch-buffering-bar");
    expect(css).toContain("z-index: 18");
    expect(css).toMatch(/\.watch-buffering-bar \{[\s\S]*?pointer-events: none/);
    expect(shell).toContain("watch-controls-overlay absolute inset-0 z-20");
    expect(shell).toContain("absolute inset-0 z-30");
    expect(client).toMatch(/watch-menu-panel[^"\n]*z-50/);
  });
});

describe("TV watch player stacking (desktop fixes must not rewrite TV)", () => {
  const watchView = readFileSync(
    path.join(webRoot, "components/tv/views/watch-view.tsx"),
    "utf8",
  );
  const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
  const backdrop = readFileSync(
    path.join(webRoot, "components/playback-poster-backdrop.tsx"),
    "utf8",
  );
  const tvShell = sliceAfter(watchView, 'data-tv-watch-player=""', 4500);

  it("keeps the TV shell attribute and z-40 (not the desktop z-50 stack)", () => {
    expect(tvShell).toContain('data-tv-watch-player=""');
    expect(tvShell).toContain('"fixed inset-0 z-40 bg-black"');
    expect(tvShell).not.toContain("data-watch-player");
    expect(tvShell).not.toContain("isolate");
    // Desktop isolation must not select the TV root.
    expect(css).not.toMatch(/\[data-tv-watch-player\]\s*\{\s*isolation:/);
  });

  it("keeps the TV video stage with poster under video under chrome", () => {
    expect(tvShell).toContain('data-tv-watch-video-stage=""');
    expect(tvShell.indexOf("PlaybackPosterBackdrop")).toBeLessThan(tvShell.indexOf("<video"));
    expect(backdrop).toContain("absolute inset-0 z-[1]");
    expect(tvShell).toContain("transparentBackground={usesNativePlayer}");
    expect(watchView).toContain(
      "const showPosterBackdrop = Boolean(posterUrl) && !playbackHasBegun && !error;",
    );
    expect(watchView).toContain(
      'className="pointer-events-none absolute inset-x-0 top-0 z-20"',
    );
    expect(watchView).toContain(
      'className="pointer-events-none absolute inset-x-0 bottom-0 z-20"',
    );
    const stageAt = watchView.indexOf('data-tv-watch-video-stage=""');
    const topChromeAt = watchView.indexOf(
      'className="pointer-events-none absolute inset-x-0 top-0 z-20"',
    );
    expect(stageAt).toBeGreaterThan(-1);
    expect(topChromeAt).toBeGreaterThan(stageAt);
  });

  it("does not apply the desktop buffering z-18 override on TV", () => {
    const sharedBar = css.slice(
      css.indexOf(".watch-buffering-bar {"),
      css.indexOf(".watch-buffering-bar::after"),
    );
    expect(sharedBar).toContain("z-index: 25");
    expect(sharedBar).toContain("pointer-events: none");
    expect(css).toContain("[data-watch-player] .watch-buffering-bar");
    expect(css).toMatch(
      /\[data-watch-player\] \.watch-buffering-bar \{\s*z-index: 18;/,
    );
    expect(watchView).toContain("watch-buffering-bar");
    expect(watchView).not.toContain("data-watch-player");
  });
});
