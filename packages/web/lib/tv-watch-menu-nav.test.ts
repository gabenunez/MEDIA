import { describe, expect, it } from "vitest";
import {
  findWatchMenuVerticalRow,
  nextWatchMenuVerticalItem,
} from "./tv-watch-menu-nav";

function buildSubtitleMenuDom() {
  document.body.innerHTML = `
    <div data-tv-watch-menu="">
      <div
        data-tv-row=""
        data-tv-content-row=""
        data-tv-vertical=""
        class="menu-list"
      >
        <button type="button" data-tv-item>Off</button>
        <div data-tv-row="" data-tv-subtitle-track-row="">
          <button type="button" data-tv-item data-tv-subtitle-track>English</button>
          <button type="button" data-tv-item data-tv-subtitle-remove tabindex="-1" aria-hidden="true">Remove</button>
        </div>
        <div data-tv-row="" data-tv-subtitle-track-row="">
          <button type="button" data-tv-item data-tv-subtitle-track>Spanish</button>
        </div>
        <button type="button" data-tv-item>Customize appearance…</button>
      </div>
    </div>
  `;

  const menuList = document.querySelector<HTMLElement>(".menu-list")!;
  const off = menuList.querySelector<HTMLElement>("button")!;
  const english = document.querySelector<HTMLElement>("[data-tv-subtitle-track]")!;
  const spanish = menuList.querySelectorAll<HTMLElement>("[data-tv-subtitle-track]")[1]!;
  const customize = menuList.querySelectorAll<HTMLElement>("button")[4]!;

  return { menuList, off, english, spanish, customize };
}

describe("findWatchMenuVerticalRow", () => {
  it("returns the menu list for direct menu items", () => {
    const { menuList, off } = buildSubtitleMenuDom();
    expect(findWatchMenuVerticalRow(off)).toBe(menuList);
  });

  it("returns the menu list when focus is on a nested subtitle track row", () => {
    const { menuList, english } = buildSubtitleMenuDom();
    expect(findWatchMenuVerticalRow(english)).toBe(menuList);
  });
});

describe("nextWatchMenuVerticalItem", () => {
  it("moves down and up across nested subtitle track rows", () => {
    const { menuList, off, english, spanish, customize } = buildSubtitleMenuDom();
    const items = Array.from(menuList.querySelectorAll<HTMLElement>("[data-tv-item]")).filter(
      (el) => el.tabIndex !== -1 && el.getAttribute("aria-hidden") !== "true",
    );

    expect(nextWatchMenuVerticalItem(off, "down", items)).toBe(english);
    expect(nextWatchMenuVerticalItem(english, "down", items)).toBe(spanish);
    expect(nextWatchMenuVerticalItem(spanish, "down", items)).toBe(customize);
    expect(nextWatchMenuVerticalItem(customize, "up", items)).toBe(spanish);
    expect(nextWatchMenuVerticalItem(english, "up", items)).toBe(off);
  });
});
