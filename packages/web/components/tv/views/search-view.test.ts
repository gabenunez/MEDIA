import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TvSearchView } from "./search-view";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/use-tv-search-results", () => ({
  useTvSearchResults: () => ({ status: "idle", results: null, retry: () => {} }),
}));

describe("TV search keyboard", () => {
  it("keeps the editor open for injected OK repeats and submits only through the form", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const setSearchKeyboardVisible = vi.fn();
    vi.stubGlobal("MediaAndroid", { setSearchKeyboardVisible });
    const startingUrl = window.location.href;
    window.history.replaceState(null, "", "/search/");
    const container = document.createElement("main");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(createElement(TvSearchView)));
      await act(async () => container.querySelector("button")?.click());
      const field = container.querySelector("input");
      expect(field).toBe(document.activeElement);
      expect(setSearchKeyboardVisible.mock.calls).toEqual([[true]]);

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        field!.value = "Dune";
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true }));
      });
      expect(container.querySelector("input")).toBe(field);
      expect(window.location.search).toBe("");
      expect(setSearchKeyboardVisible.mock.calls).toEqual([[true]]);

      await act(async () => {
        field!.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(container.querySelector("input")).toBeNull();
      expect(new URLSearchParams(window.location.search).get("q")).toBe("Dune");
      expect(setSearchKeyboardVisible.mock.calls).toEqual([[true], [false]]);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.history.replaceState(null, "", startingUrl);
      vi.unstubAllGlobals();
    }
  });
});
