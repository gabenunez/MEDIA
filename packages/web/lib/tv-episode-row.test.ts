import { describe, expect, it, beforeEach } from "vitest";
import {
  collapseEpisodeActions,
  tryMoveEpisodeActions,
} from "./tv-episode-row";

function mountEpisodeList() {
  document.body.innerHTML = `
    <div data-tv-row data-tv-vertical>
      <div data-tv-episode-row>
        <a data-tv-item data-tv-episode-id="1" data-tv-episode-play>Episode 1</a>
        <div class="tv-episode-actions">
          <a data-tv-item data-tv-episode-action tabindex="-1" aria-hidden="true">Restart 1</a>
          <button data-tv-item data-tv-episode-action tabindex="-1" aria-hidden="true">Watched 1</button>
        </div>
      </div>
      <div data-tv-episode-row>
        <a data-tv-item data-tv-episode-id="2" data-tv-episode-play>Episode 2</a>
        <div class="tv-episode-actions">
          <button data-tv-item data-tv-episode-action tabindex="-1" aria-hidden="true">Watched 2</button>
        </div>
      </div>
    </div>
  `;
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tv-episode-row]"),
  );
  return { rows };
}

describe("TV episode row actions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reveals the action group (focusing the first action) when pressing right", () => {
    const { rows } = mountEpisodeList();
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    const actions = rows[0].querySelectorAll<HTMLElement>("[data-tv-episode-action]");

    const next = tryMoveEpisodeActions(play, "right");

    expect(next).toBe(actions[0]);
    expect(rows[0].hasAttribute("data-tv-episode-actions-visible")).toBe(true);
    actions.forEach((a) => {
      expect(a.tabIndex).toBe(0);
      expect(a.getAttribute("aria-hidden")).toBeNull();
    });
  });

  it("hides the actions when pressing left from the first action", () => {
    const { rows } = mountEpisodeList();
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    const actions = Array.from(
      rows[0].querySelectorAll<HTMLElement>("[data-tv-episode-action]"),
    );
    rows[0].setAttribute("data-tv-episode-actions-visible", "");
    actions.forEach((a) => {
      a.tabIndex = 0;
      a.removeAttribute("aria-hidden");
    });

    const next = tryMoveEpisodeActions(actions[0], "left");

    expect(next).toBe(play);
    expect(rows[0].hasAttribute("data-tv-episode-actions-visible")).toBe(false);
    actions.forEach((a) => {
      expect(a.tabIndex).toBe(-1);
      expect(a.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("does not consume left from a non-first action (lets geometry nav move between actions)", () => {
    const { rows } = mountEpisodeList();
    const actions = Array.from(
      rows[0].querySelectorAll<HTMLElement>("[data-tv-episode-action]"),
    );
    rows[0].setAttribute("data-tv-episode-actions-visible", "");
    expect(tryMoveEpisodeActions(actions[1], "left")).toBeNull();
  });

  it("collapses a revealed group and refocuses its episode on vertical nav", () => {
    const { rows } = mountEpisodeList();
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    const actions = Array.from(
      rows[0].querySelectorAll<HTMLElement>("[data-tv-episode-action]"),
    );
    rows[0].setAttribute("data-tv-episode-actions-visible", "");
    actions.forEach((a) => {
      a.tabIndex = 0;
      a.removeAttribute("aria-hidden");
    });
    actions[1].focus();

    collapseEpisodeActions();

    expect(rows[0].hasAttribute("data-tv-episode-actions-visible")).toBe(false);
    expect(actions[1].tabIndex).toBe(-1);
    expect(document.activeElement).toBe(play);
  });

  it("keeps action buttons out of the focusable vertical set until revealed", () => {
    const { rows } = mountEpisodeList();
    const focusable = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-tv-item]")).filter(
        (el) => el.tabIndex !== -1 && el.getAttribute("aria-hidden") !== "true",
      );

    // Only the two episode links are vertically reachable.
    expect(focusable().map((el) => el.textContent)).toEqual([
      "Episode 1",
      "Episode 2",
    ]);

    // Revealing row 0 exposes its actions (for Right/Left only).
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    tryMoveEpisodeActions(play, "right");
    expect(focusable().length).toBe(4); // 2 episodes + 2 revealed actions
  });
});
