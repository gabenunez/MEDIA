/** How long a held D-pad direction waits before the next 0.1s subtitle step. */
export const TV_SUBTITLE_SYNC_HOLD_MS = 160;
export const TV_SUBTITLE_SYNC_STEP_EVENT = "tv-subtitle-sync-step";

let lastStepAt = 0;
let lastDirection: "left" | "right" | null = null;

/** Left/right on the timing row steps the offset and stays focused. */
export function tryAdjustSubtitleSync(
  active: HTMLElement,
  direction: "left" | "right",
  options?: { repeat?: boolean; now?: number },
): boolean {
  if (!active.hasAttribute("data-tv-subtitle-sync")) return false;

  const now = options?.now ?? performance.now();
  const sameDirection = direction === lastDirection;
  const tooSoon = now - lastStepAt < TV_SUBTITLE_SYNC_HOLD_MS;
  // Hold, or a burst of the same direction, waits. The opposite direction still corrects immediately.
  if (tooSoon && (options?.repeat || sameDirection)) return true;

  lastStepAt = now;
  lastDirection = direction;
  active.dispatchEvent(
    new CustomEvent(TV_SUBTITLE_SYNC_STEP_EVENT, {
      detail: direction === "left" ? -1 : 1,
    }),
  );
  return true;
}
