import { describe, expect, it } from "vitest";
import {
  cacheAuthStatus,
  isIosDevice,
  isStandalonePwa,
  readCachedAuthStatus,
  shouldOfferPwaInstall,
} from "./pwa";

describe("isIosDevice", () => {
  it("detects iPhone user agents", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
    });
    expect(isIosDevice()).toBe(true);
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: original,
    });
  });
});

describe("standalone / install offer", () => {
  it("does not offer install when already standalone", () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("standalone"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      })) as unknown as typeof window.matchMedia;
    expect(isStandalonePwa()).toBe(true);
    expect(shouldOfferPwaInstall()).toBe(false);
    window.matchMedia = matchMedia;
  });
});

describe("cached auth status", () => {
  it("round-trips the last known gate state", () => {
    cacheAuthStatus({ required: true, authenticated: true });
    expect(readCachedAuthStatus()).toEqual({
      required: true,
      authenticated: true,
    });
  });
});
