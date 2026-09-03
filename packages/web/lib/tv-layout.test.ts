import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TV_LIVING_ROOM_LAYOUT,
  TV_LIVING_ROOM_MEDIA,
  extractCssBlock,
  parseClampMaxRem,
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
    expect(parseRem(tvUi["--tv-scroll-pad-top"])).toBe(
      TV_LIVING_ROOM_LAYOUT.scrollRowPadTopRem,
    );
    expect(parseRem(tvUi["--tv-scroll-pad-bottom"])).toBe(
      TV_LIVING_ROOM_LAYOUT.scrollRowPadBottomRem,
    );
    const scrollRow = extractCssBlock(css, ".tv-ui .tv-scroll-row {");
    expect(scrollRow).toMatch(/align-items:\s*flex-start/);
    expect(scrollRow).toMatch(
      /padding-block:\s*var\(--tv-scroll-pad-top\)\s+var\(--tv-scroll-pad-bottom\)/,
    );
    expect(scrollRow).toMatch(/overflow-y:\s*hidden/);
    const main = extractCssBlock(css, ".tv-ui > main {");
    expect(main).toMatch(
      new RegExp(
        `padding-block:\\s*${TV_LIVING_ROOM_LAYOUT.mainPadTopRem}rem ${TV_LIVING_ROOM_LAYOUT.mainPadBottomRem}rem`,
      ),
    );
  });

  it("keeps two home rows inside a 1080p TV viewport", () => {
    const layout = TV_LIVING_ROOM_LAYOUT;
    const headerRem = 1.15;
    const tilePadRem = 0.2;
    const artRem = layout.posterWidthRem * 1.5;
    const titleRem = 0.25 + 1.25 * 0.875;
    const subtitleRem = 0.1 + 0.875;
    const row = (subtitle: boolean) =>
      headerRem +
      layout.scrollRowPadTopRem +
      layout.scrollRowPadBottomRem +
      tilePadRem +
      artRem +
      titleRem +
      (subtitle ? subtitleRem : 0);
    const stackRem =
      layout.mainPadTopRem +
      row(true) +
      layout.sectionGapRem +
      row(false) +
      layout.mainPadBottomRem;
    expect(stackRem * layout.rootFontPx).toBeLessThan(1080);
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

describe("TV living-room series title page", () => {
  const css = readTvGlobalsCss(webRoot);
  const tvUi = readCssCustomProps(extractCssBlock(css, ".tv-ui {"));
  const mediaView = readFileSync(
    path.join(webRoot, "components/tv/views/media-view.tsx"),
    "utf8",
  );

  it("keeps the series hero and episode stills at living-room size", () => {
    expect(parseRem(tvUi["--tv-media-poster-width"])).toBe(
      TV_LIVING_ROOM_MEDIA.posterWidthRem,
    );
    expect(parseRem(tvUi["--tv-episode-still-width"])).toBe(
      TV_LIVING_ROOM_MEDIA.episodeStillWidthRem,
    );
    expect(parseRem(tvUi["--tv-episode-still-height"])).toBe(
      TV_LIVING_ROOM_MEDIA.episodeStillHeightRem,
    );

    const hero = extractCssBlock(css, ".tv-media-hero {");
    expect(parseRem(hero.match(/max-height\s*:\s*([^;]+);/)?.[1])).toBe(
      TV_LIVING_ROOM_MEDIA.heroMaxHeightRem,
    );

    const title = extractCssBlock(css, ".tv-ui .tv-media-title {");
    expect(parseClampMaxRem(title.match(/font-size\s*:\s*([^;]+);/)?.[1])).toBe(
      TV_LIVING_ROOM_MEDIA.titleMaxRem,
    );
  });

  it("does not keep the 10-foot series markup", () => {
    expect(mediaView).not.toMatch(/w-\[10\.5rem\]/);
    expect(mediaView).not.toMatch(/-mt-\[7\.5rem\]/);
    expect(mediaView).not.toMatch(/px-6 py-3 text-lg/);
    expect(mediaView).not.toMatch(/line-clamp-3 max-w-4xl/);
    expect(mediaView).toMatch(/px-4 py-2 text-sm/);
    expect(mediaView).toMatch(/tv-media-episode-title/);
    expect(mediaView).toMatch(/line-clamp-1/);
  });

  it("does not let tv-4k inflate the series hero", () => {
    expect(extractCssBlock(css, "html.tv-mode.tv-4k .tv-media-hero {").trim()).toBe("");
  });
});
