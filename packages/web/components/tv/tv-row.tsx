"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TvRowProps {
  title: string;
  children: ReactNode;
  className?: string;
  href?: string;
}

export function TvRow({ title, children, className, href }: TvRowProps) {
  return (
    <section className={cn("mb-10", className)}>
      <div className="mb-4 flex items-center justify-between gap-4 px-8">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {href ? (
          <a href={href} className="text-sm font-medium text-primary hover:underline">
            View all
          </a>
        ) : null}
      </div>
      <div
        data-tv-row=""
        className="scrollbar-hide flex snap-x snap-mandatory gap-5 overflow-x-auto px-8 pb-2"
      >
        {children}
      </div>
    </section>
  );
}

interface TvGridProps {
  children: ReactNode;
  className?: string;
}

export function TvGrid({ children, className }: TvGridProps) {
  return (
    <div
      data-tv-row=""
      className={cn(
        "grid grid-cols-3 gap-x-6 gap-y-10 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7",
        className,
      )}
    >
      {children}
    </div>
  );
}
