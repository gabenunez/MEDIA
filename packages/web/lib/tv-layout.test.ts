import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TV_LIVING_ROOM_LAYOUT,
  extractCssBlock,
  parseRem,
  readCssCustomProps,
  readTvGlobalsCss,
  tvRowPosterCount,
} from "./tv-layout";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("TV living-room catalog scale", () => {
  const css = readTvGlobalsCss(webRoot);
  const tvUi = readCssCustomProps(extractCssBlock(css, ".tv-ui {"));

  it("keeps catalog tokens at pre-v0.1.197 living-room size", () => {
    expect(parseRem(tvUi["--tv-poster-width"])).toBe(TV_LIVING_ROOM_LAYOUT.posterWidthRem);
    expect(parseRem(tvUi["--tv-grid-poster-min"])).toBe(TV_LIVING_ROOM_LAYOUT.gridPosterMinRem);
    expect(parseRem(tvUi["--tv-browse-card-min"])).toBe(TV_LIVING_ROOM_LAYOUT.browseCardMinRem);
    expect(parseRem(tvUi["--tv-page-gutter"])).toBe(TV_LIVING_ROOM_LAYOUT.pageGutterRem);
    expect(parseRem(tvUi["--tv-row-gap"])).toBe(TV_LIVING_ROOM_LAYOUT.rowGapRem);
    expect(parseRem(tvUi["--tv-section-gap"])).toBe(TV_LIVING_ROOM_LAYOUT.sectionGapRem);
  });

  it("fits at least 10 posters in a 1080p TV row", () => {
    expect(tvRowPosterCount(1920)).toBeGreaterThanOrEqual(
      TV_LIVING_ROOM_LAYOUT.minRowPostersAt1080,
    );
  });

  it("does not let tv-4k inflate layout on a 1920 CSS-pixel WebView", () => {
    const fourKRoot = extractCssBlock(css, "html.tv-mode.tv-4k {");
    expect(fourKRoot).not.toMatch(/font-size\s*:\s*112/);

    const fourKUi = extractCssBlock(css, "html.tv-mode.tv-4k .tv-ui {");
    expect(fourKUi).not.toMatch(/--tv-poster-width\s*:/);
    expect(fourKUi).not.toMatch(/--tv-grid-poster-min\s*:/);
    expect(fourKUi).not.toMatch(/--tv-page-gutter\s*:/);

    const fourKPageTitle = extractCssBlock(css, "html.tv-mode.tv-4k .tv-ui .tv-page h1 {");
    expect(fourKPageTitle.trim()).toBe("");
  });
});
