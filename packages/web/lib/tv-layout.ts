import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pre-v0.1.197 living-room catalog scale. 10-foot commits overshot this. */
export const TV_LIVING_ROOM_LAYOUT = {
  posterWidthRem: 7.5,
  gridPosterMinRem: 9.5,
  browseCardMinRem: 14,
  pageGutterRem: 2,
  rowGapRem: 0.75,
  sectionGapRem: 1.5,
  asideWidthRem: 4.25,
  rootFontPx: 16,
  /** 1920×1080 WebView: keep a dense row, not 6–7 oversized tiles. */
  minRowPostersAt1080: 10,
} as const;

/** Pre-v0.1.206 series title page — 10-foot chips/stills hid the episode list. */
export const TV_LIVING_ROOM_MEDIA = {
  posterWidthRem: 7,
  episodeStillWidthRem: 6.75,
  episodeStillHeightRem: 3.75,
  heroMaxHeightRem: 15,
  titleMaxRem: 1.75,
} as const;

export function parseRem(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(-?[\d.]+)rem$/i);
  if (!match) return null;
  return Number(match[1]);
}

export function parseClampMaxRem(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/clamp\([^,]+,[^,]+,\s*(-?[\d.]+)rem\)/i);
  return match ? Number(match[1]) : null;
}

export function extractCssBlock(css: string, header: string): string {
  const idx = css.indexOf(header);
  if (idx === -1) return "";
  const brace = css.indexOf("{", idx + header.length - 1);
  if (brace === -1) return "";
  let depth = 0;
  for (let i = brace; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(brace + 1, i);
    }
  }
  return "";
}

export function readCssCustomProps(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const match of block.matchAll(re)) {
    props[`--${match[1]}`] = match[2].trim();
  }
  return props;
}

export function tvRowPosterCount(
  viewportPx = 1920,
  layout: {
    posterWidthRem: number;
    pageGutterRem: number;
    rowGapRem: number;
    asideWidthRem: number;
    rootFontPx: number;
  } = TV_LIVING_ROOM_LAYOUT,
): number {
  const root = layout.rootFontPx;
  const available =
    viewportPx -
    layout.asideWidthRem * root -
    layout.pageGutterRem * root * 2;
  const stride = layout.posterWidthRem * root + layout.rowGapRem * root;
  return Math.max(0, Math.floor((available + layout.rowGapRem * root) / stride));
}

export function readTvGlobalsCss(webRoot?: string): string {
  const root =
    webRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return readFileSync(path.join(root, "app/globals.css"), "utf8");
}
