import { describe, expect, it } from "vitest";
import {
  TV_CRITICAL_CSS,
  TV_MODE_BOOTSTRAP_SCRIPT,
  WEB_CLIENT_HTML_CLASS,
  shouldUseTv4KAssets,
} from "./tv-mode-detect";

describe("TV 4K asset detection", () => {
  it("treats a 1920 CSS WebView with high DPR as 4K for artwork, not layout", () => {
    expect(shouldUseTv4KAssets(1920, 1920, 2)).toBe(true);
    expect(shouldUseTv4KAssets(3840, 1920, 1)).toBe(true);
    expect(shouldUseTv4KAssets(1920, 1920, 1)).toBe(false);
  });
});

describe("background grid flash guard", () => {
  it("suppresses the body grid by default and opts in only for web clients", () => {
    // The dangerous default (grid) must be off so a TV (or a document where the
    // tv-mode class is momentarily absent) can never paint the grid pattern.
    expect(TV_CRITICAL_CSS).toContain("body{background-image:none!important}");
    expect(TV_CRITICAL_CSS).toContain(
      `html.${WEB_CLIENT_HTML_CLASS} body{background-image:var(--web-body-grid)!important}`,
    );
  });

  it("marks confirmed non-TV clients so the grid is opt-in, never both classes", () => {
    // Web branch adds web-client; TV branch removes it and never gets the grid.
    expect(TV_MODE_BOOTSTRAP_SCRIPT).toContain(`h.classList.add(w)`);
    expect(TV_MODE_BOOTSTRAP_SCRIPT).toContain(`h.classList.remove(w)`);
    expect(TV_MODE_BOOTSTRAP_SCRIPT).toContain(
      JSON.stringify(WEB_CLIENT_HTML_CLASS),
    );
  });
});
