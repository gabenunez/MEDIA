import { describe, expect, it, beforeEach } from "vitest";
import {
  collapseSubtitleTrackActions,
  tryMoveSubtitleTrackActions,
} from "./tv-subtitle-track-row";

function mountSubtitleRow() {
  document.body.innerHTML = `
    <div data-tv-subtitle-track-row>
      <button type="button" data-tv-item data-tv-subtitle-track>English</button>
      <button type="button" data-tv-item data-tv-subtitle-remove tabindex="-1" aria-hidden="true">Remove</button>
    </div>
  `;
  const row = document.querySelector<HTMLElement>("[data-tv-subtitle-track-row]")!;
  const track = row.querySelector<HTMLElement>("[data-tv-subtitle-track]")!;
  const remove = row.querySelector<HTMLElement>("[data-tv-subtitle-remove]")!;
  return { row, track, remove };
}

describe("TV subtitle track row actions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reveals Remove when pressing right on the track label", () => {
    const { row, track, remove } = mountSubtitleRow();
    track.focus();

    const next = tryMoveSubtitleTrackActions(track, "right");

    expect(next).toBe(remove);
    expect(row.hasAttribute("data-tv-subtitle-actions-visible")).toBe(true);
    expect(remove.tabIndex).toBe(0);
    expect(remove.getAttribute("aria-hidden")).toBeNull();
  });

  it("hides Remove when pressing left from the remove action", () => {
    const { row, track, remove } = mountSubtitleRow();
    row.setAttribute("data-tv-subtitle-actions-visible", "");
    remove.tabIndex = 0;
    remove.removeAttribute("aria-hidden");
    remove.focus();

    const next = tryMoveSubtitleTrackActions(remove, "left");

    expect(next).toBe(track);
    expect(row.hasAttribute("data-tv-subtitle-actions-visible")).toBe(false);
    expect(remove.tabIndex).toBe(-1);
    expect(remove.getAttribute("aria-hidden")).toBe("true");
  });

  it("collapses revealed actions when navigating vertically", () => {
    const { row, track, remove } = mountSubtitleRow();
    row.setAttribute("data-tv-subtitle-actions-visible", "");
    remove.tabIndex = 0;
    remove.removeAttribute("aria-hidden");
    remove.focus();

    collapseSubtitleTrackActions();

    expect(row.hasAttribute("data-tv-subtitle-actions-visible")).toBe(false);
    expect(document.activeElement).toBe(track);
  });
});
