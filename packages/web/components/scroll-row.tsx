"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollRowProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Called once when the pointer enters the carousel scroller. */
  onPointerEnterRow?: (scroller: HTMLDivElement) => void;
}

export function ScrollRow({
  children,
  className,
  contentClassName,
  onPointerEnterRow,
}: ScrollRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pointerInRowRef = useRef(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const prefetchVisiblePosters = useCallback(() => {
    const node = scrollerRef.current;
    if (!node || !onPointerEnterRow) return;
    onPointerEnterRow(node);
  }, [onPointerEnterRow]);

  const handlePointerEnterRow = useCallback(() => {
    pointerInRowRef.current = true;
    prefetchVisiblePosters();
  }, [prefetchVisiblePosters]);

  const handlePointerLeaveRow = useCallback(() => {
    pointerInRowRef.current = false;
  }, []);

  const updateScrollState = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
    if (maxScroll <= 1) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const containerRect = node.getBoundingClientRect();
    const first = node.firstElementChild as HTMLElement | null;
    const last = node.lastElementChild as HTMLElement | null;
    const atStart = first
      ? first.getBoundingClientRect().left >= containerRect.left - 1
      : true;
    const atEnd = last
      ? last.getBoundingClientRect().right <= containerRect.right + 1
      : true;

    setCanScrollLeft(!atStart);
    setCanScrollRight(!atEnd);
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    node.scrollLeft = 0;
    updateScrollState();
  }, [updateScrollState]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const runUpdate = () => {
      updateScrollState();
      if (pointerInRowRef.current) {
        prefetchVisiblePosters();
      }
    };

    runUpdate();
    const frame = requestAnimationFrame(runUpdate);

    const observer = new ResizeObserver(runUpdate);
    observer.observe(node);
    node.addEventListener("scroll", runUpdate, { passive: true });
    node.addEventListener("load", runUpdate, true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener("scroll", runUpdate);
      node.removeEventListener("load", runUpdate, true);
    };
  }, [updateScrollState, prefetchVisiblePosters]);

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
        onPointerEnter={handlePointerEnterRow}
        onPointerLeave={handlePointerLeaveRow}
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
