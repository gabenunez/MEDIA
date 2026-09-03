"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { TvFocusButton, TvFocusLink } from "@/components/tv/tv-focus-link";
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
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: ReactNode;
  className?: string;
}

/** Catalog chrome: Back, then title. */
export function TvPageHeader({
  backHref,
  backLabel = "Back",
  title,
  subtitle,
  className,
}: TvPageHeaderProps) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch(backHref);
  }, [router, backHref]);

  return (
    <header className={cn("mb-6", className)}>
      <div data-tv-row="" data-tv-content-row="" className="mb-4">
        <TvFocusLink
          href={backHref}
          className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-base font-semibold"
        >
          <ChevronLeft className="h-5 w-5" />
          {backLabel}
        </TvFocusLink>
      </div>
      <h1 className="max-w-[22ch] truncate text-2xl font-bold leading-tight tracking-tight">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
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
  const router = useRouter();
  useEffect(() => {
    router.prefetch(fallbackHref);
  }, [router, fallbackHref]);

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
          router.push(fallbackHref);
        }}
        className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-base font-semibold"
      >
        <ChevronLeft className="h-5 w-5" />
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
