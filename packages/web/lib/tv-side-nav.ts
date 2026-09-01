/** Overlay side rail on TV — hidden until Left has nowhere else to go. */

export const TV_NAV_OPEN_ATTR = "data-tv-nav-open";
export const TV_RAIL_SELECTOR = "[data-tv-rail]";

export function isTvWatchActive() {
  return document.documentElement.hasAttribute("data-tv-watch-active");
}

export function isTvSideNavOpen() {
  return document.documentElement.hasAttribute(TV_NAV_OPEN_ATTR);
}

export function openTvSideNav(): boolean {
  if (typeof document === "undefined") return false;
  if (isTvWatchActive()) return false;

  const rail = document.querySelector<HTMLElement>(TV_RAIL_SELECTOR);
  document.documentElement.setAttribute(TV_NAV_OPEN_ATTR, "");
  rail?.removeAttribute("inert");
  return true;
}

export function closeTvSideNav() {
  if (typeof document === "undefined") return;

  document.documentElement.removeAttribute(TV_NAV_OPEN_ATTR);
  document.querySelector<HTMLElement>(TV_RAIL_SELECTOR)?.setAttribute("inert", "");
}

/** Keep the rail visible only while focus is on a nav item. */
export function syncTvSideNavToFocus(target: HTMLElement | null) {
  if (target?.closest("[data-tv-nav-row]")) {
    openTvSideNav();
    return;
  }
  closeTvSideNav();
}
