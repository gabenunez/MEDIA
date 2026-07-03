import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/80 shadow-inner shadow-white/[0.02]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
