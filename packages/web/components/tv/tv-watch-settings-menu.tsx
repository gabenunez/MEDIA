"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";

export function TvWatchSideSheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" aria-hidden />
      <div
        data-tv-watch-side-sheet=""
        className={cn(
          "relative flex h-full w-[min(24rem,36vw)] min-w-[17rem] flex-col",
          "border-l border-white/15 bg-background shadow-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function TvWatchMenuPanel({
  title,
  description,
  onBack,
  children,
  className,
}: {
  title: string;
  description?: string;
  onBack: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TvWatchSideSheet>
      <aside
        data-tv-watch-menu=""
        className={cn("flex h-full min-h-0 flex-col", className)}
      >
        <div
          data-tv-row=""
          data-tv-watch-menu-header=""
          className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3"
        >
          <TvFocusButton
            variant="nav"
            onClick={onBack}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
          >
            <ChevronLeft className="h-6 w-6" />
          </TvFocusButton>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-white">{title}</h2>
            {description ? (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {children}
        </div>
      </aside>
    </TvWatchSideSheet>
  );
}

export function TvWatchMenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="tv-watch-menu-section-label px-1 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pt-0">
      {children}
    </p>
  );
}

export function TvWatchMenuList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-tv-row=""
      data-tv-content-row=""
      data-tv-vertical=""
      className={cn("flex flex-col gap-1", className)}
    >
      {children}
    </div>
  );
}

/** Compact popover anchored above a watch toolbar button (mirrors desktop dropdowns). */
export function TvWatchPopover({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-tv-watch-menu=""
      className={cn(
        "absolute bottom-full right-0 z-50 mb-2 rounded-md border border-border bg-card p-1 shadow-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function tvWatchMenuOptionClassName(extra?: string) {
  return cn("w-full rounded-xl px-4 py-3 text-left text-base", extra);
}

export function tvWatchPopoverOptionClassName(...extra: Array<string | false | null | undefined>) {
  return cn("w-full rounded px-3 py-1.5 text-left text-sm", ...extra);
}
