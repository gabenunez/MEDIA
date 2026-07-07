"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";

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
    <div
      data-tv-watch-menu=""
      className={cn("fixed inset-0 z-50 flex flex-col bg-background", className)}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-4">
        <TvFocusButton
          variant="nav"
          onClick={onBack}
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
        >
          <ChevronLeft className="h-6 w-6" />
        </TvFocusButton>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold text-white">{title}</h2>
          {description ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </div>
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

export function tvWatchMenuOptionClassName(extra?: string) {
  return cn("w-full rounded-xl px-4 py-3.5 text-left text-base", extra);
}
