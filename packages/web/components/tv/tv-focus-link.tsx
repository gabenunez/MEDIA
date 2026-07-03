"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const tvFocusClassName =
  "rounded-lg outline-none transition-transform focus-visible:scale-[1.04] focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function TvFocusLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link data-tv-item="" className={cn(tvFocusClassName, className)} {...props} />
  );
}

export function TvFocusButton({
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-tv-item=""
      className={cn(tvFocusClassName, className)}
      {...props}
    />
  );
}
