import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeTvSideNav,
  isTvSideNavOpen,
  openTvSideNav,
  syncTvSideNavToFocus,
  TV_NAV_OPEN_ATTR,
} from "./tv-side-nav";

describe("TV side nav overlay", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(TV_NAV_OPEN_ATTR);
    document.documentElement.removeAttribute("data-tv-watch-active");
    document.body.innerHTML = "";
  });

  function mountRail() {
    document.body.innerHTML = `
      <aside data-tv-rail inert>
        <nav data-tv-nav-row>
          <a data-tv-item id="home">Home</a>
        </nav>
      </aside>
      <main>
        <a data-tv-item id="poster">Poster</a>
      </main>
    `;
  }

  it("stays closed until opened", () => {
    mountRail();
    expect(isTvSideNavOpen()).toBe(false);
  });

  it("opens the rail and clears inert so nav items can take focus", () => {
    mountRail();
    expect(openTvSideNav()).toBe(true);
    expect(isTvSideNavOpen()).toBe(true);
    expect(document.querySelector("[data-tv-rail]")?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("does not open during watch", () => {
    mountRail();
    document.documentElement.setAttribute("data-tv-watch-active", "true");
    expect(openTvSideNav()).toBe(false);
    expect(isTvSideNavOpen()).toBe(false);
    expect(document.querySelector("[data-tv-rail]")?.hasAttribute("inert")).toBe(
      true,
    );
  });

  it("closes and restores inert", () => {
    mountRail();
    openTvSideNav();
    closeTvSideNav();
    expect(isTvSideNavOpen()).toBe(false);
    expect(document.querySelector("[data-tv-rail]")?.hasAttribute("inert")).toBe(
      true,
    );
  });

  it("stays open while focus is on a nav item and closes on content focus", () => {
    mountRail();
    const home = document.getElementById("home") as HTMLElement;
    const poster = document.getElementById("poster") as HTMLElement;

    syncTvSideNavToFocus(home);
    expect(isTvSideNavOpen()).toBe(true);

    syncTvSideNavToFocus(poster);
    expect(isTvSideNavOpen()).toBe(false);
  });
});

describe("TV side nav — spatial nav wiring", () => {
  const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const spatialNav = readFileSync(
    path.join(webRoot, "components/tv/tv-spatial-nav.tsx"),
    "utf8",
  );
  const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
  const shell = readFileSync(
    path.join(webRoot, "components/tv/tv-shell.tsx"),
    "utf8",
  );

  it("opens the overlay rail only when Left leaves the current row", () => {
    expect(spatialNav).toContain("openTvSideNav");
    const focusNav = spatialNav.slice(
      spatialNav.indexOf("function focusNavFromContent"),
      spatialNav.indexOf("function focusContentFromNav"),
    );
    expect(focusNav.indexOf("openTvSideNav()")).toBeGreaterThan(-1);
    expect(focusNav.indexOf("openTvSideNav()")).toBeLessThan(
      focusNav.indexOf("getRowItems(navRow)"),
    );
    expect(spatialNav).toContain(
      'if (direction === "left" && !inWatchMenu) return focusNavFromContent(active)',
    );
    expect(spatialNav).not.toContain(
      "if (direction === \"up\" && contentIndex === 0)",
    );
  });

  it("hides the rail with CSS until data-tv-nav-open", () => {
    expect(shell).toContain('data-tv-rail=""');
    expect(css).toContain(".tv-ui [data-tv-rail]");
    expect(css).toContain("html[data-tv-nav-open] .tv-ui [data-tv-rail]");
  });
});
