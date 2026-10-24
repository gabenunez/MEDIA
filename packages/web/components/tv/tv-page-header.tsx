"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { cn } from "@/lib/utils";

/** Shared page frame — gutters match home rows. */
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
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
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
      <p className="text-xl font-semibold leading-snug text-muted-foreground">{children}</p>
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
  title: string;
  subtitle?: ReactNode;
  className?: string;
}

/** Catalog chrome: page title. Remote Back leaves the page. */
export function TvPageHeader({
  title,
  subtitle,
  className,
}: TvPageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      <h1 className="max-w-[22ch] truncate text-2xl font-bold leading-tight tracking-tight">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
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
    <h2 className={cn("mb-2 px-0 text-sm font-semibold tracking-wide text-muted-foreground", className)}>
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
      className={cn("mt-8 flex items-center justify-center gap-4 pb-4", className)}
    >
      <TvFocusButton
        disabled={page <= 1}
        onClick={() => changePage(page - 1)}
        className="inline-flex h-12 min-w-[9rem] items-center justify-center gap-2 px-5 text-base font-semibold disabled:opacity-40"
      >
        <ChevronLeft className="h-5 w-5" /> Previous
      </TvFocusButton>
      <span className="min-w-[5rem] text-center text-base tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <TvFocusButton
        disabled={page >= totalPages}
        onClick={() => changePage(page + 1)}
        className="inline-flex h-12 min-w-[9rem] items-center justify-center gap-2 px-5 text-base font-semibold disabled:opacity-40"
      >
        Next <ChevronRight className="h-5 w-5" />
      </TvFocusButton>
    </div>
  );
}
