"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WatchControlHint({
  label,
  placement = "above",
  children,
}: {
  label: string;
  placement?: "above" | "below";
  children: ReactNode;
}) {
  return (
    <div className="group/watch-hint relative">
      {children}
      <span
        className={cn(
          "watch-control-hint",
          placement === "below" ? "watch-control-hint-below" : "watch-control-hint-above",
        )}
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}
