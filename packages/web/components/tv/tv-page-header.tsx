"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/** Shared 10-foot page frame — gutters match home rows. */
export function TvPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("tv-page", className)}>{children}</div>;
}

export function TvPageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-14 w-14 animate-spin text-primary" />
    </div>
  );
}

export function TvEmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      data-tv-row=""
      data-tv-content-row=""
      className="flex min-h-[40vh] flex-col items-center justify-center px-8 text-center"
    >
      <p className="text-3xl font-semibold leading-snug text-muted-foreground">{children}</p>
      {action ? <div className="mt-10 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Join header meta pieces ("208 titles"). */
export function tvPageMeta(
  parts: Array<string | false | null | undefined>,
): string | undefined {
  const text = parts.filter(Boolean).join(" · ");
  return text || undefined;
}

interface TvPageHeaderProps {
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: ReactNode;
  className?: string;
}

/** Netflix-style catalog chrome: Back, then a large title. */
export function TvPageHeader({
  backHref,
  backLabel = "Back",
  title,
  subtitle,
  className,
}: TvPageHeaderProps) {
  return (
    <header className={cn("mb-10", className)}>
      <div data-tv-row="" data-tv-content-row="" className="mb-7">
        <TvFocusLink
          href={backHref}
          className="inline-flex h-14 items-center gap-2 rounded-xl px-6 text-lg font-semibold"
        >
          <ChevronLeft className="h-6 w-6" />
          {backLabel}
        </TvFocusLink>
      </div>
      <h1 className="max-w-[18ch] truncate text-[2.75rem] font-black leading-[1.08] tracking-tight">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 text-xl text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}

/** History-aware back for detail pages that may be opened from a library. */
export function TvHistoryBackButton({
  fallbackHref,
  label = "Back",
}: {
  fallbackHref: string;
  label?: string;
}) {
  return (
    <div data-tv-row="" data-tv-content-row="">
      <TvFocusButton
        onClick={() => {
          try {
            const referrer = document.referrer;
            if (referrer && new URL(referrer).origin === window.location.origin) {
              window.history.back();
              return;
            }
          } catch {
            // fall through
          }
          window.location.assign(withBasePath(fallbackHref));
        }}
        className="inline-flex h-14 items-center gap-2 rounded-xl px-6 text-lg font-semibold"
      >
        <ChevronLeft className="h-6 w-6" />
        {label}
      </TvFocusButton>
    </div>
  );
}

interface TvSectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function TvSectionLabel({ children, className }: TvSectionLabelProps) {
  return (
    <h2 className={cn("mb-3 px-0 text-lg font-semibold tracking-wide text-muted-foreground", className)}>
      {children}
    </h2>
  );
}

interface TvPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function TvPagination({ page, totalPages, onPageChange, className }: TvPaginationProps) {
  if (totalPages <= 1) return null;

  const changePage = (next: number) => {
    document.querySelector("main")?.scrollTo({ top: 0 });
    onPageChange(next);
  };

  return (
    <div
      data-tv-row=""
      data-tv-content-row=""
      className={cn("mt-12 flex items-center justify-center gap-6 pb-6", className)}
    >
      <TvFocusButton
        disabled={page <= 1}
        onClick={() => changePage(page - 1)}
        className="inline-flex h-16 min-w-[11rem] items-center justify-center gap-2 px-7 text-lg font-semibold disabled:opacity-40"
      >
        <ChevronLeft className="h-6 w-6" /> Previous
      </TvFocusButton>
      <span className="min-w-[6rem] text-center text-xl tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <TvFocusButton
        disabled={page >= totalPages}
        onClick={() => changePage(page + 1)}
        className="inline-flex h-16 min-w-[11rem] items-center justify-center gap-2 px-7 text-lg font-semibold disabled:opacity-40"
      >
        Next <ChevronRight className="h-6 w-6" />
      </TvFocusButton>
    </div>
  );
}
