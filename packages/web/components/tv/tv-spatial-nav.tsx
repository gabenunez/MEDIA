"use client";

import { useEffect, type ReactNode } from "react";

function focusTvItem(el: HTMLElement) {
  el.focus();
  el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function getRowItems(row: Element) {
  return Array.from(row.querySelectorAll<HTMLElement>("[data-tv-item]")).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

export function TvSpatialNav({ children }: { children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight" &&
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown"
      ) {
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      if (!active?.dataset.tvItem) return;

      const row = active.closest("[data-tv-row]");
      if (!row) return;

      e.preventDefault();

      const rows = Array.from(document.querySelectorAll("[data-tv-row]"));
      const rowIndex = rows.indexOf(row);
      const items = getRowItems(row);
      const itemIndex = items.indexOf(active);

      if (e.key === "ArrowRight" && itemIndex < items.length - 1) {
        focusTvItem(items[itemIndex + 1]);
        return;
      }

      if (e.key === "ArrowLeft" && itemIndex > 0) {
        focusTvItem(items[itemIndex - 1]);
        return;
      }

      if (e.key === "ArrowDown" && rowIndex < rows.length - 1) {
        const nextItems = getRowItems(rows[rowIndex + 1]);
        const next = nextItems[Math.min(itemIndex, nextItems.length - 1)];
        if (next) focusTvItem(next);
        return;
      }

      if (e.key === "ArrowUp" && rowIndex > 0) {
        const prevItems = getRowItems(rows[rowIndex - 1]);
        const prev = prevItems[Math.min(itemIndex, prevItems.length - 1)];
        if (prev) focusTvItem(prev);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <>{children}</>;
}
