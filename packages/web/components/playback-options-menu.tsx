"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreOptionsIcon } from "@/components/more-options-icon";
import { routes } from "@/lib/routes";
import { START_FROM_BEGINNING_LABEL, cn } from "@/lib/utils";

export function PlaybackOptionsMenu({
  type,
  fileId,
  mediaId,
  className,
}: {
  type: "movie" | "episode";
  fileId: number;
  mediaId: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    if (!button) return;

    const place = () => {
      const rect = button.getBoundingClientRect();
      const menuWidth = 224;
      const menuHeight = 52;
      const gap = 8;
      const openUp = window.innerHeight - rect.bottom < menuHeight + gap && rect.top > menuHeight;
      const top = openUp ? rect.top - gap - menuHeight : rect.bottom + gap;
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
      setMenuStyle({ top, left });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="More playback options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/50 text-muted-foreground outline-none transition-colors",
          "hover:border-primary/45 hover:text-foreground",
          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open && "border-primary/50 text-foreground",
        )}
      >
        <MoreOptionsIcon className="h-5 w-5" />
      </button>
      {open && menuStyle && (
        <div
          role="menu"
          style={{ top: menuStyle.top, left: menuStyle.left }}
          className="fixed z-50 min-w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
        >
          <Link
            role="menuitem"
            href={routes.watchFromStart(type, fileId, mediaId)}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <RotateCcw className="h-4 w-4 text-primary" />
            {START_FROM_BEGINNING_LABEL}
          </Link>
        </div>
      )}
    </div>
  );
}
