import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateApiCache, seedApiCache } from "./api-cache";
import type { HomeData } from "./server-api";
import { initialHomeData, useLiveHomeData } from "./use-live-home-data";

const { useScanStatus, refreshRoute } = vi.hoisted(() => ({
  useScanStatus: vi.fn(),
  refreshRoute: vi.fn(),
}));
vi.mock("@/components/scan-status-provider", () => ({ useScanStatus }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshRoute }) }));

const cached = {
  continueWatching: [],
  recentlyAdded: [],
  favorites: [],
  libraries: [],
  decks: [],
  tmdbConfigured: true,
  recentPlay: null,
} satisfies HomeData;

afterEach(() => {
  invalidateApiCache();
});

describe("initialHomeData", () => {
  it("paints a cached homepage before the network round trip", () => {
    seedApiCache("home", cached, 30_000);
    expect(initialHomeData(null)).toEqual(cached);
  });

  it("keeps an explicit seed ahead of the cache", () => {
    seedApiCache("home", cached, 30_000);
    const seed = { ...cached, tmdbConfigured: false };
    expect(initialHomeData(seed)).toBe(seed);
  });

  it("stays empty when nothing has been fetched yet", () => {
    expect(initialHomeData(null)).toBeNull();
  });
});

describe("live Home", () => {
  it("updates in place with one API request when a scan ends and counts change together", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const initialData = { ...cached, tmdbConfigured: false };
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((finish) => {
      resolve = finish;
    });
    const fetchHome = vi.fn(() => promise);
    vi.stubGlobal("fetch", fetchHome);

    const container = document.createElement("div");
    const root = createRoot(container);
    function HomeProbe() {
      const { data } = useLiveHomeData(initialData);
      return createElement("span", null, data?.tmdbConfigured ? "updated" : "original");
    }
    const renderPoll = async (isScanning: boolean, itemCount: number) => {
      useScanStatus.mockReturnValue({
        status: { libraries: [{ id: 1, itemCount }] },
        activeScan: null,
        isScanning,
      });
      await act(async () => root.render(createElement(HomeProbe)));
    };

    try {
      await renderPoll(true, 1);
      expect(fetchHome).not.toHaveBeenCalled();
      await renderPoll(false, 2);

      expect(container.textContent).toBe("original");
      expect(fetchHome).toHaveBeenCalledOnce();
      expect(refreshRoute).not.toHaveBeenCalled();

      await act(async () => {
        resolve(Response.json(cached));
      });
      expect(container.textContent).toBe("updated");
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
