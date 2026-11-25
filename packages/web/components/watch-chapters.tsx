"use client";

import { useCallback, useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ListVideo, Play, X } from "lucide-react";
import type { MediaChapter } from "@media-app/shared";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import { focusTvItem } from "@/lib/tv-focus";
import type { SeekThumbnailCue } from "@/lib/use-seek-thumbnails";
import { cn, formatDuration } from "@/lib/utils";

export function WatchChapterMarkers({
  chapters,
  durationMs,
  activeIndex,
}: {
  chapters: readonly MediaChapter[];
  durationMs: number;
  activeIndex: number;
}) {
  if (!(durationMs > 0)) return null;
  return chapters.map(({ startMs }, index) =>
    startMs > 0 && startMs < durationMs ? (
      <span
        key={startMs}
        aria-hidden="true"
        className={cn("watch-chapter-marker", index === activeIndex && "watch-chapter-marker--current")}
        style={{ left: `${startMs / durationMs * 100}%` }}
      />
    ) : null,
  );
}

function ChapterThumbnail({
  cue,
  spriteUrl,
  number,
  tv,
}: {
  cue: SeekThumbnailCue | null;
  spriteUrl: string | null;
  number: number;
  tv: boolean;
}) {
  const width = tv ? 112 : 96;
  const scale = cue ? Math.max(width / cue.width, (width * 9 / 16) / cue.height) : 1;
  return (
    <span className="watch-chapter-thumb" style={{ width }} aria-hidden="true">
      {cue && spriteUrl ? (
        <span
          className="absolute left-0 top-0 block origin-top-left"
          style={{
            width: cue.width,
            height: cue.height,
            transform: `scale(${scale})`,
            backgroundImage: `url(${spriteUrl})`,
            backgroundPosition: `-${cue.x}px -${cue.y}px`,
            backgroundRepeat: "no-repeat",
          }}
        />
      ) : null}
      <span className="watch-chapter-number">{String(number).padStart(2, "0")}</span>
    </span>
  );
}

export function WatchChaptersPanel({
  chapters,
  activeIndex,
  onSelect,
  onClose,
  lookupCue,
  spriteUrl,
  tv = false,
  restoreFocus,
}: {
  chapters: readonly MediaChapter[];
  activeIndex: number;
  onSelect: (chapter: MediaChapter) => void;
  onClose: () => void;
  lookupCue: (timeMs: number) => SeekThumbnailCue | null;
  spriteUrl: string | null;
  tv?: boolean;
  restoreFocus?: () => void;
}) {
  const headingId = useId();
  const initialIndex = useRef(Math.max(0, activeIndex)).current;
  const listRef = useRef<HTMLDivElement>(null);
  const focusChapter = useCallback((index: number) => {
    const row = listRef.current?.querySelector<HTMLButtonElement>(`[data-watch-chapter-index="${index}"]`);
    if (!row) return;
    if (tv) focusTvItem(row);
    else {
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    }
  }, [tv]);

  useLayoutEffect(() => {
    if (tv) focusChapter(initialIndex);
  }, [tv, focusChapter, initialIndex]);

  const handleWebListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = Number((event.target as HTMLElement).closest<HTMLElement>("[data-watch-chapter-index]")?.dataset.watchChapterIndex);
    if (!Number.isInteger(index)) return;
    switch (event.key) {
      case "ArrowUp": focusChapter(Math.max(0, index - 1)); break;
      case "ArrowDown": focusChapter(Math.min(chapters.length - 1, index + 1)); break;
      case "Home": focusChapter(0); break;
      case "End": focusChapter(chapters.length - 1); break;
      default: return;
    }
    event.preventDefault();
  };

  const headerTitle = <><ListVideo className="h-5 w-5 text-primary" aria-hidden="true" /> Chapters</>;
  const count = `${chapters.length} ${chapters.length === 1 ? "chapter" : "chapters"}`;
  const content = (
    <>
      <header className="watch-chapters-header">
        <div>
          {tv ? <h2 id={headingId}>{headerTitle}</h2> : <Dialog.Title>{headerTitle}</Dialog.Title>}
          {tv ? <p>{count}</p> : <Dialog.Description>{count} · Select one to jump there</Dialog.Description>}
        </div>
        {tv ? <span className="watch-chapters-back">Back to close</span> : (
          <Dialog.Close className="watch-chapters-close" aria-label="Close chapters">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        )}
      </header>
      <div className="watch-chapters-scroll">
        <div
          ref={listRef}
          data-tv-row={tv ? "" : undefined}
          data-tv-content-row={tv ? "" : undefined}
          data-tv-vertical={tv ? "" : undefined}
          className="watch-chapters-list"
          onKeyDown={tv ? undefined : handleWebListKey}
        >
          {chapters.map((chapter, index) => {
            const active = index === activeIndex;
            const Row = tv ? TvFocusButton : "button";
            return (
              <Row
                key={chapter.startMs}
                type="button"
                data-watch-chapter-index={index}
                data-tv-selected={tv && active ? "" : undefined}
                aria-current={active ? "step" : undefined}
                className="watch-chapter-row"
                onClick={() => onSelect(chapter)}
              >
                <ChapterThumbnail
                  cue={lookupCue(chapter.startMs)}
                  spriteUrl={spriteUrl}
                  number={index + 1}
                  tv={tv}
                />
                <span className="watch-chapter-copy">
                  <span className="watch-chapter-title">{chapter.title}</span>
                  <span className="watch-chapter-meta">
                    <span className="tabular-nums">{formatDuration(chapter.startMs)}</span>
                    {active && (
                      <span className="watch-chapter-current">
                        <Play className="h-3 w-3" fill="currentColor" aria-hidden="true" /> Current chapter
                      </span>
                    )}
                  </span>
                </span>
              </Row>
            );
          })}
        </div>
      </div>
    </>
  );

  if (tv) {
    return (
      <div className="absolute inset-0 z-50">
        <div className="watch-chapters-backdrop" aria-hidden="true" onClick={onClose} />
        <aside className="watch-chapters-panel watch-chapters-panel--tv" data-tv-watch-menu="" data-watch-chapters=""
          role="dialog" aria-modal="true" aria-labelledby={headingId}>
          {content}
        </aside>
      </div>
    );
  }
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Render inside the player so the panel stays visible in fullscreen. */}
      <Dialog.Overlay className="watch-chapters-backdrop z-50" />
      <Dialog.Content
        className="watch-chapters-panel z-50"
        data-watch-chapters=""
        onOpenAutoFocus={(event) => { event.preventDefault(); focusChapter(initialIndex); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus?.(); }}
      >
        {content}
      </Dialog.Content>
    </Dialog.Root>
  );
}
