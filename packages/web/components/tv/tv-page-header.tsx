"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";
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
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
      <p className="text-2xl font-semibold text-muted-foreground">{children}</p>
      {action ? <div className="mt-8 flex justify-center">{action}</div> : null}
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
    <header className={cn("mb-8", className)}>
      <div data-tv-row="" data-tv-content-row="" className="mb-6">
        <TvFocusLink
          href={backHref}
          className="inline-flex h-12 items-center gap-2 rounded-xl px-5 text-base font-semibold"
        >
          <ChevronLeft className="h-5 w-5" />
          {backLabel}
        </TvFocusLink>
      </div>
      <h1 className="max-w-[18ch] truncate text-[2.5rem] font-black leading-[1.08] tracking-tight">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-lg text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}

interface TvSectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function TvSectionLabel({ children, className }: TvSectionLabelProps) {
  return (
    <h2 className={cn("mb-2 px-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground", className)}>
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
      className={cn("mt-10 flex items-center justify-center gap-5 pb-4", className)}
    >
      <TvFocusButton
        disabled={page <= 1}
        onClick={() => changePage(page - 1)}
        className="inline-flex h-14 min-w-[10rem] items-center justify-center gap-2 px-6 text-base font-semibold disabled:opacity-40"
      >
        <ChevronLeft className="h-5 w-5" /> Previous
      </TvFocusButton>
      <span className="min-w-[5.5rem] text-center text-lg tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <TvFocusButton
        disabled={page >= totalPages}
        onClick={() => changePage(page + 1)}
        className="inline-flex h-14 min-w-[10rem] items-center justify-center gap-2 px-6 text-base font-semibold disabled:opacity-40"
      >
        Next <ChevronRight className="h-5 w-5" />
      </TvFocusButton>
    </div>
  );
}
