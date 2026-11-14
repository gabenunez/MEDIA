import { describe, expect, it, beforeEach } from "vitest";
import {
  collapseEpisodeRestarts,
  tryMoveEpisodeRestart,
} from "./tv-episode-row";

function mountEpisodeList() {
  document.body.innerHTML = `
    <div data-tv-row data-tv-vertical>
      <div data-tv-episode-row>
        <a data-tv-item data-tv-episode-id="1" data-tv-episode-play>Episode 1</a>
        <a data-tv-item data-tv-episode-restart tabindex="-1" aria-hidden="true">Restart 1</a>
      </div>
      <div data-tv-episode-row>
        <a data-tv-item data-tv-episode-id="2" data-tv-episode-play>Episode 2</a>
        <a data-tv-item data-tv-episode-restart tabindex="-1" aria-hidden="true">Restart 2</a>
      </div>
      <div>
        <a data-tv-item data-tv-episode-id="3">Episode 3 (no resume)</a>
      </div>
    </div>
  `;
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tv-episode-row]"),
  );
  return { rows };
}

describe("TV episode row restart action", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reveals the restart button when pressing right on the episode", () => {
    const { rows } = mountEpisodeList();
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    const restart = rows[0].querySelector<HTMLElement>("[data-tv-episode-restart]")!;

    const next = tryMoveEpisodeRestart(play, "right");

    expect(next).toBe(restart);
    expect(rows[0].hasAttribute("data-tv-episode-restart-visible")).toBe(true);
    expect(restart.tabIndex).toBe(0);
    expect(restart.getAttribute("aria-hidden")).toBeNull();
  });

  it("hides the restart button when pressing left from it", () => {
    const { rows } = mountEpisodeList();
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    const restart = rows[0].querySelector<HTMLElement>("[data-tv-episode-restart]")!;
    rows[0].setAttribute("data-tv-episode-restart-visible", "");
    restart.tabIndex = 0;
    restart.removeAttribute("aria-hidden");

    const next = tryMoveEpisodeRestart(restart, "left");

    expect(next).toBe(play);
    expect(rows[0].hasAttribute("data-tv-episode-restart-visible")).toBe(false);
    expect(restart.tabIndex).toBe(-1);
    expect(restart.getAttribute("aria-hidden")).toBe("true");
  });

  it("does nothing for right on an already-revealed row (lets horizontal nav proceed)", () => {
    const { rows } = mountEpisodeList();
    const restart = rows[0].querySelector<HTMLElement>("[data-tv-episode-restart]")!;
    rows[0].setAttribute("data-tv-episode-restart-visible", "");
    restart.tabIndex = 0;
    restart.removeAttribute("aria-hidden");

    // Right while already on the revealed restart isn't ours to handle.
    expect(tryMoveEpisodeRestart(restart, "right")).toBeNull();
  });

  it("returns null for rows without a restart (non-resumable episode)", () => {
    mountEpisodeList();
    const ep3 = document.querySelector<HTMLElement>('[data-tv-episode-id="3"]')!;
    expect(tryMoveEpisodeRestart(ep3, "right")).toBeNull();
    expect(tryMoveEpisodeRestart(ep3, "left")).toBeNull();
  });

  it("collapses a revealed restart and refocuses its episode on vertical nav", () => {
    const { rows } = mountEpisodeList();
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    const restart = rows[0].querySelector<HTMLElement>("[data-tv-episode-restart]")!;
    rows[0].setAttribute("data-tv-episode-restart-visible", "");
    restart.tabIndex = 0;
    restart.removeAttribute("aria-hidden");
    restart.focus();

    collapseEpisodeRestarts();

    expect(rows[0].hasAttribute("data-tv-episode-restart-visible")).toBe(false);
    expect(restart.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(play);
  });

  it("keeps the restart out of the focusable vertical item set until revealed", () => {
    const { rows } = mountEpisodeList();
    // Simulate the spatial-nav focusability filter: aria-hidden / tabindex -1
    // excludes an element from the Up/Down flow.
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>("[data-tv-item]"),
    ).filter((el) => el.tabIndex !== -1 && el.getAttribute("aria-hidden") !== "true");

    // Only the three episode links are reachable vertically (no restart buttons).
    expect(focusable.map((el) => el.textContent)).toEqual([
      "Episode 1",
      "Episode 2",
      "Episode 3 (no resume)",
    ]);

    // After revealing row 0's restart, it becomes reachable (for Right/Left only).
    const play = rows[0].querySelector<HTMLElement>("[data-tv-episode-play]")!;
    tryMoveEpisodeRestart(play, "right");
    const restart = rows[0].querySelector<HTMLElement>("[data-tv-episode-restart]")!;
    expect(restart.tabIndex).toBe(0);
  });
});
