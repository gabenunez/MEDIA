"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampAbsoluteSeekSeconds, type WatchSkipArrowKey } from "@/lib/tv-watch-player";

export const WATCH_HOLD_SCRUB_DELAY_MS = 360;
const PREVIEW_TICK_MS = 100;
const MAX_HOLD_MS = 30_000;

export type HoldScrubPreview = {
  key: WatchSkipArrowKey;
  originSeconds: number;
  targetSeconds: number;
};

type HoldScrubPress = {
  key: WatchSkipArrowKey;
  timer: ReturnType<typeof setTimeout>;
};

type HoldScrubRelease = { kind: "tap" } | { kind: "seek"; targetSeconds: number };

/** The first preview moves one step; longer holds cover a chapter in seconds. */
function holdScrubDistance(elapsedSeconds: number): number {
  return 10 + 30 * Math.min(elapsedSeconds, 1) +
    90 * Math.min(Math.max(elapsedSeconds - 1, 0), 1.5) +
    240 * Math.max(elapsedSeconds - 2.5, 0);
}

export function useWatchHoldScrub() {
  const pressRef = useRef<HoldScrubPress | null>(null);
  const holdScrubPreviewRef = useRef<HoldScrubPreview | null>(null);
  const [holdScrubPreview, setPreview] = useState<HoldScrubPreview | null>(null);

  const cancelHoldScrub = useCallback((): boolean => {
    const press = pressRef.current;
    if (!press) return false;
    clearTimeout(press.timer);
    pressRef.current = null;
    if (holdScrubPreviewRef.current) {
      holdScrubPreviewRef.current = null;
      setPreview(null);
    }
    return true;
  }, []);

  const beginHoldScrub = useCallback((options: {
    key: WatchSkipArrowKey;
    repeat: boolean;
    durationSeconds: number;
    readPlayhead: () => number;
    onPreviewStart: () => void;
  }) => {
    const { key, repeat, durationSeconds, readPlayhead, onPreviewStart } = options;
    if (repeat || !(durationSeconds > 0)) return;
    cancelHoldScrub();

    const press: HoldScrubPress = {
      key,
      timer: setTimeout(() => {
        if (pressRef.current !== press) return;
        const originSeconds = clampAbsoluteSeekSeconds(readPlayhead(), durationSeconds);
        const direction = key === "ArrowLeft" ? -1 : 1;
        const previewStartedAt = Date.now();
        onPreviewStart();
        const tick = () => {
          if (pressRef.current !== press) return;
          const elapsedMs = Date.now() - previewStartedAt;
          if (elapsedMs >= MAX_HOLD_MS) {
            // The release can be lost if a remote disconnects mid-press.
            cancelHoldScrub();
            return;
          }
          const targetSeconds = clampAbsoluteSeekSeconds(
            originSeconds + direction * holdScrubDistance(elapsedMs / 1000),
            durationSeconds,
          );
          if (holdScrubPreviewRef.current?.targetSeconds !== targetSeconds) {
            const preview = { key, originSeconds, targetSeconds };
            holdScrubPreviewRef.current = preview;
            setPreview(preview);
          }
          press.timer = setTimeout(tick, PREVIEW_TICK_MS);
        };
        tick();
      }, WATCH_HOLD_SCRUB_DELAY_MS),
    };
    pressRef.current = press;
  }, [cancelHoldScrub]);

  const releaseHoldScrub = useCallback((key: WatchSkipArrowKey, canceled: boolean): HoldScrubRelease | null => {
    if (pressRef.current?.key !== key) return null;
    const preview = holdScrubPreviewRef.current;
    cancelHoldScrub();
    if (canceled) return null;
    if (!preview) return { kind: "tap" };
    if (preview.targetSeconds === preview.originSeconds) return null;
    return { kind: "seek", targetSeconds: preview.targetSeconds };
  }, [cancelHoldScrub]);

  useEffect(() => {
    const onBlur = () => cancelHoldScrub();
    const onVisibilityChange = () => {
      if (document.hidden) cancelHoldScrub();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (pressRef.current) clearTimeout(pressRef.current.timer);
      pressRef.current = null;
      holdScrubPreviewRef.current = null;
    };
  }, [cancelHoldScrub]);

  return { holdScrubPreview, holdScrubPreviewRef, beginHoldScrub, cancelHoldScrub, releaseHoldScrub };
}
