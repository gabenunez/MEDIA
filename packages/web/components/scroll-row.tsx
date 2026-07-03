"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollRowProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function ScrollRow({ children, className, contentClassName }: ScrollRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const maxScroll = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 4);
    setCanScrollRight(maxScroll - node.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    updateScrollState();

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(node);

    return () => observer.disconnect();
  }, [updateScrollState, children]);

  const scrollBy = (direction: "left" | "right") => {
    const node = scrollerRef.current;
    if (!node) return;

    const amount = Math.max(node.clientWidth * 0.75, 280);
    node.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div className={cn("relative", className)}>
      {canScrollLeft && (
        <ScrollArrow direction="left" onClick={() => scrollBy("left")} />
      )}
      {canScrollRight && (
        <ScrollArrow direction="right" onClick={() => scrollBy("right")} />
      )}

      <div
        ref={scrollerRef}
        onScroll={updateScrollState}
        className={cn(
          "scrollbar-hide flex snap-x gap-4 overflow-x-auto pb-3",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ScrollArrow({
  direction,
  onClick,
}: {
  direction: "left" | "right";
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
      onClick={onClick}
      className={cn(
        "absolute top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-lg backdrop-blur transition hover:border-primary/40 hover:text-primary sm:flex",
        direction === "left" ? "left-1" : "right-1",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
