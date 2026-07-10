"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { forwardRef, type ComponentProps } from "react";

/** Side rail nav icons */
export const tvNavItemClassName =
  "tv-focus-nav rounded-lg border-2 border-transparent outline-none ring-0 shadow-none transition-colors duration-75 ease-out";

/** Standard TV buttons (back, pagination, play controls on light bg) */
export const tvFocusRingClassName =
  "tv-focus-button rounded-lg border-2 border-transparent outline-none ring-0 shadow-none transition-colors duration-75 ease-out";

/** Poster tiles — focus styling lives on the art via globals.css */
export const tvPosterLinkClassName =
  "tv-poster-link block shrink-0 outline-none ring-0 shadow-none";

/** List rows, episode cards, menu items */
export const tvCardLinkClassName =
  "tv-focus-card block rounded-lg border-2 border-transparent outline-none ring-0 shadow-none transition-colors duration-75 ease-out";

/** Filter / season tabs — selected state via data-tv-selected */
export const tvChipClassName =
  "tv-focus-chip shrink-0 snap-center rounded-lg border-2 border-transparent outline-none ring-0 shadow-none transition-colors duration-75 ease-out";

/** Watch transport controls — visuals owned by globals.css (.watch-control-btn) */
export const tvWatchControlClassName =
  "watch-control-btn outline-none ring-0 shadow-none";

function focusSelectedProps(selected?: boolean) {
  return selected ? ({ "data-tv-selected": "" as const }) : {};
}

function variantClassName(
  variant: "default" | "poster" | "card" | "nav" | "chip" | "watch",
) {
  switch (variant) {
    case "poster":
      return tvPosterLinkClassName;
    case "card":
      return tvCardLinkClassName;
    case "nav":
      return tvNavItemClassName;
    case "chip":
      return tvChipClassName;
    case "watch":
      return tvWatchControlClassName;
    default:
      return tvFocusRingClassName;
  }
}

export function TvFocusLink({
  className,
  variant = "default",
  selected,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: "default" | "poster" | "card" | "nav" | "chip" | "watch";
  selected?: boolean;
}) {
  return (
    <Link
      data-tv-item=""
      tabIndex={0}
      className={cn(variantClassName(variant), className)}
      {...focusSelectedProps(selected)}
      {...props}
    />
  );
}

export const TvFocusButton = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & {
    variant?: "default" | "card" | "nav" | "chip" | "watch";
    selected?: boolean;
  }
>(function TvFocusButton({ className, variant = "default", selected, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-tv-item=""
      tabIndex={0}
      className={cn(variantClassName(variant), className)}
      {...focusSelectedProps(selected)}
      {...props}
    />
  );
});
