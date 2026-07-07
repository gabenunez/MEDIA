import { shiftVttByOffset } from "@media-app/shared";
import { api } from "@/lib/api";

const vttCache = new Map<number, string>();
const inflight = new Map<number, Promise<string | null>>();
const playbackReadyListeners = new Set<() => void>();

export type SubtitleDisplayMode = "native" | "dom-overlay";

export function notifyWebPlaybackSourceReady(): void {
  for (const listener of playbackReadyListeners) {
    listener();
  }
}

export function subscribeWebPlaybackSourceReady(listener: () => void): () => void {
  playbackReadyListeners.add(listener);
  return () => {
    playbackReadyListeners.delete(listener);
  };
}

export function clearSubtitleVttCache(): void {
  vttCache.clear();
  inflight.clear();
}

export function evictSubtitleVttCache(subtitleId: number): void {
  vttCache.delete(subtitleId);
  inflight.delete(subtitleId);
}

export async function prefetchSubtitleVtt(
  subtitleId: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const cached = vttCache.get(subtitleId);
  if (cached) return cached;

  const pending = inflight.get(subtitleId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await fetch(api.subtitleUrl(subtitleId), {
        credentials: "include",
        signal,
      });
      if (!res.ok) return null;

      const vtt = await res.text();
      if (!vtt.trim()) return null;

      vttCache.set(subtitleId, vtt);
      return vtt;
    } catch {
      return null;
    } finally {
      inflight.delete(subtitleId);
    }
  })();

  inflight.set(subtitleId, promise);
  return promise;
}

export function prefetchSubtitleTracks(
  trackIds: number[],
  signal?: AbortSignal,
): void {
  for (const id of trackIds) {
    void prefetchSubtitleVtt(id, signal);
  }
}

function resolveShiftedVtt(subtitleId: number, timelineOffsetSeconds: number): string | null {
  const raw = vttCache.get(subtitleId);
  if (!raw) return null;
  return timelineOffsetSeconds > 0 ? shiftVttByOffset(raw, timelineOffsetSeconds) : raw;
}

function trackDisplayMode(displayMode: SubtitleDisplayMode): TextTrackMode {
  return displayMode === "dom-overlay" ? "hidden" : "showing";
}

function clearWebSubtitleTracks(video: HTMLVideoElement) {
  video.querySelectorAll("track").forEach((element) => element.remove());
  for (const track of Array.from(video.textTracks)) {
    track.mode = "disabled";
  }
}

function showTextTrack(
  video: HTMLVideoElement,
  textTrack: TextTrack,
  displayMode: SubtitleDisplayMode,
) {
  const mode = trackDisplayMode(displayMode);
  for (const track of Array.from(video.textTracks)) {
    track.mode = track === textTrack ? mode : "disabled";
  }
}

function enableLatestSubtitleTrack(
  video: HTMLVideoElement,
  displayMode: SubtitleDisplayMode,
) {
  const tracks = Array.from(video.textTracks).filter((track) => track.kind === "subtitles");
  const next = tracks.at(-1);
  if (next) showTextTrack(video, next, displayMode);
}

function attachTrackElement(
  video: HTMLVideoElement,
  objectUrl: string,
  label: string,
  displayMode: SubtitleDisplayMode,
): HTMLTrackElement {
  const trackElement = document.createElement("track");
  trackElement.kind = "subtitles";
  trackElement.src = objectUrl;
  trackElement.default = true;
  trackElement.label = label;
  trackElement.srclang = label.slice(0, 2) || "en";
  trackElement.addEventListener("load", () => {
    if (trackElement.track) showTextTrack(video, trackElement.track, displayMode);
  });
  trackElement.addEventListener("error", () => {
    console.warn("Failed to load subtitle track", { label, src: objectUrl });
  });
  video.appendChild(trackElement);
  if (trackElement.track) {
    showTextTrack(video, trackElement.track, displayMode);
  } else {
    enableLatestSubtitleTrack(video, displayMode);
  }
  return trackElement;
}

function attachVttToVideo(
  video: HTMLVideoElement,
  vtt: string,
  label: string,
  displayMode: SubtitleDisplayMode,
): string {
  const objectUrl = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  attachTrackElement(video, objectUrl, label, displayMode);
  requestAnimationFrame(() => enableLatestSubtitleTrack(video, displayMode));
  return objectUrl;
}

export async function prepareWebSubtitleVtt(
  subtitleId: number,
  timelineOffsetSeconds = 0,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) return null;

  let shifted = resolveShiftedVtt(subtitleId, timelineOffsetSeconds);
  if (!shifted) {
    const raw = await prefetchSubtitleVtt(subtitleId, signal);
    if (!raw || signal?.aborted) return null;
    shifted =
      timelineOffsetSeconds > 0 ? shiftVttByOffset(raw, timelineOffsetSeconds) : raw;
  }

  if (!shifted || signal?.aborted) return null;
  return shifted;
}

export function attachPreparedWebSubtitle(
  video: HTMLVideoElement,
  vtt: string,
  label: string,
  displayMode: SubtitleDisplayMode = "native",
): string {
  clearWebSubtitleTracks(video);
  return attachVttToVideo(video, vtt, label, displayMode);
}

export function attachCachedWebSubtitle(
  video: HTMLVideoElement,
  subtitleId: number,
  label: string,
  timelineOffsetSeconds = 0,
  displayMode: SubtitleDisplayMode = "native",
): string | null {
  const shifted = resolveShiftedVtt(subtitleId, timelineOffsetSeconds);
  if (!shifted) return null;

  return attachPreparedWebSubtitle(video, shifted, label, displayMode);
}

export async function syncWebSubtitleTrack(
  video: HTMLVideoElement,
  subtitleId: number | null,
  label: string,
  signal: AbortSignal,
  timelineOffsetSeconds = 0,
  displayMode: SubtitleDisplayMode = "native",
  shouldAttach: () => boolean = () => true,
): Promise<string | null> {
  if (subtitleId === null || signal.aborted) {
    clearWebSubtitleTracks(video);
    return null;
  }

  const shifted = await prepareWebSubtitleVtt(subtitleId, timelineOffsetSeconds, signal);
  if (!shifted || signal.aborted || !shouldAttach()) return null;

  return attachPreparedWebSubtitle(video, shifted, label, displayMode);
}

export function installWebSubtitleVideoListeners(
  video: HTMLVideoElement,
  onReload: () => void,
  displayMode: SubtitleDisplayMode = "native",
): () => void {
  const onAddTrack = (event: TrackEvent) => {
    if (event.track?.kind === "subtitles") {
      showTextTrack(video, event.track, displayMode);
    }
  };

  const ensureSubtitlesVisible = () => {
    const hasTrackElement = video.querySelector("track") != null;
    if (!hasTrackElement) {
      onReload();
      return;
    }
    enableLatestSubtitleTrack(video, displayMode);
  };

  video.textTracks.addEventListener("addtrack", onAddTrack);
  video.addEventListener("emptied", onReload);
  video.addEventListener("canplay", ensureSubtitlesVisible);
  video.addEventListener("seeked", ensureSubtitlesVisible);

  return () => {
    video.textTracks.removeEventListener("addtrack", onAddTrack);
    video.removeEventListener("emptied", onReload);
    video.removeEventListener("canplay", ensureSubtitlesVisible);
    video.removeEventListener("seeked", ensureSubtitlesVisible);
  };
}

export function clearWebSubtitleTracksFromVideo(video: HTMLVideoElement) {
  clearWebSubtitleTracks(video);
}

/** Force the browser to repaint active subtitle cues after style changes. */
export function refreshWebSubtitleCues(video: HTMLVideoElement): void {
  for (const track of Array.from(video.textTracks)) {
    if (track.kind !== "subtitles" || track.mode === "disabled") continue;
    const previousMode = track.mode;
    track.mode = "disabled";
    track.mode = previousMode;
  }
}
