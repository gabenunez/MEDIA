import { describe, expect, it, vi } from "vitest";
import { installTvNativeNavigation, tvAppLocation } from "./tv-navigation";

describe("native TV app navigation", () => {
  it("matches only valid app locations on the same origin and public prefix", () => {
    const current = "https://media.test/reel/";
    expect(tvAppLocation("https://media.test/reel/search/?q=Alien", current, "/reel")?.pathname).toBe("/search/");
    expect(tvAppLocation("https://media.test/search/", current, "/reel")).toBeNull();
    expect(tvAppLocation("https://elsewhere.test/reel/search/", current, "/reel")).toBeNull();
    expect(tvAppLocation("https://media.test/reel/api/auth/status", current, "/reel")).toBeNull();
  });

  it("routes voice search and cast in the current document without adding duplicate search entries", () => {
    const original = window.location.href;
    const originalState = window.history.state;
    const push = vi.fn();
    const replace = vi.fn();
    const closeEditor = vi.fn(() => true);
    const cleanup = installTvNativeNavigation({ push, replace });
    try {
      window.history.replaceState(null, "", "/favorites/");
      expect(window.__mediaNavigate?.("/search/?tv=1&q=Dune%3A+Part+Two")).toBe(true);
      expect(push).toHaveBeenCalledWith("/search/?q=Dune%3A+Part+Two");

      window.history.replaceState(null, "", "/search/?q=Dune");
      window.__mediaSearchHandleBack = closeEditor;
      expect(window.__mediaNavigate?.("/search/?tv=1&q=Alien")).toBe(true);
      expect(closeEditor).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledWith("/search/?q=Alien");
      expect(window.__mediaNavigate?.("/watch/episode/45/?tv=1&media=92&start=100")).toBe(true);
      expect(push).toHaveBeenLastCalledWith("/watch/episode/45/?media=92&start=100");
      expect(window.__mediaNavigate?.("/settings/")).toBe(false);
    } finally {
      delete window.__mediaSearchHandleBack;
      cleanup();
      window.history.replaceState(originalState, "", original);
    }
  });
});
