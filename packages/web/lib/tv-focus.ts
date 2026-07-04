/** Shared TV focus helpers for spatial nav and page views. */

export function scrollItemIntoView(
  el: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const horizontalRow = el.closest<HTMLElement>(
    "[data-tv-scroll-row]:not([data-tv-vertical])",
  );
  if (horizontalRow) {
    const rowRect = horizontalRow.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const targetLeft =
      horizontalRow.scrollLeft +
      (elRect.left - rowRect.left) -
      (rowRect.width - elRect.width) / 2;
    horizontalRow.scrollTo({ left: Math.max(0, targetLeft), behavior });
  }

  el.scrollIntoView({
    behavior,
    block: "center",
    inline: "nearest",
  });
}

export function focusTvItem(
  el: HTMLElement,
  scrollBehavior: ScrollBehavior = "smooth",
) {
  document.querySelectorAll<HTMLElement>("[data-tv-focused]").forEach((node) => {
    node.removeAttribute("data-tv-focused");
  });
  el.setAttribute("data-tv-focused", "");
  el.focus({ preventScroll: true });
  requestAnimationFrame(() => scrollItemIntoView(el, scrollBehavior));
}

/** Focus a TV episode row by file id. Returns false if the row is not in the DOM. */
export function focusEpisodeItem(episodeId: number): boolean {
  const main = document.querySelector("main");
  if (!main) return false;
  const item = main.querySelector<HTMLElement>(
    `[data-tv-item][data-tv-episode-id="${episodeId}"]`,
  );
  if (!item) return false;
  focusTvItem(item);
  return true;
}

/** Focus the first focusable item inside main content (skips side nav). */
export function focusFirstContentItem() {
  const main = document.querySelector("main");
  if (!main) return;
  const item = main.querySelector<HTMLElement>("[data-tv-item]");
  if (item) focusTvItem(item);
}

/** Focus the first item in the topmost content row. */
export function focusPrimaryContentItem() {
  const main = document.querySelector("main");
  if (!main) return;
  const row = main.querySelector<HTMLElement>("[data-tv-content-row]");
  const item = row?.querySelector<HTMLElement>("[data-tv-item]");
  if (item) focusTvItem(item);
}
