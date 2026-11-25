import { describe, expect, it } from "vitest";
import {
  TV_CRITICAL_CSS,
  TV_MODE_BOOTSTRAP_SCRIPT,
  TV_MODE_KEY,
  WEB_CLIENT_HTML_CLASS,
  initTvMode,
  shouldUseTv4KAssets,
} from "./tv-mode-detect";

it("strips the TV flag without destroying the router's initial history entry", () => {
  const originalUrl = window.location.href;
  const originalState = window.history.state;
  const originalMode = sessionStorage.getItem(TV_MODE_KEY);
  const routerState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["", {}] } };
  try {
    window.history.replaceState(routerState, "", "/reel/?tv=1&other=value#anchor");
    const length = window.history.length;

    expect(initTvMode()).toBe(true);
    expect(window.history.state).toEqual(routerState);
    expect(window.history.length).toBe(length);
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe("/reel/?other=value#anchor");
  } finally {
    window.history.replaceState(originalState, "", originalUrl);
    if (originalMode == null) sessionStorage.removeItem(TV_MODE_KEY);
    else sessionStorage.setItem(TV_MODE_KEY, originalMode);
  }
});

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
