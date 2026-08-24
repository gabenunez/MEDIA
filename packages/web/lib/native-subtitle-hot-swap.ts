/** How the Android TV shell should apply a caption change. */
export type NativeSubtitleApplyMode = "vtt-overlay" | "url-overlay" | "rebuild-playback";

export function resolveNativeSubtitleApplyMode(bridge: {
  setSubtitleVtt?: unknown;
  setSubtitles?: unknown;
}): NativeSubtitleApplyMode {
  if (typeof bridge.setSubtitleVtt === "function") return "vtt-overlay";
  if (typeof bridge.setSubtitles === "function") return "url-overlay";
  return "rebuild-playback";
}

/** Overlay swaps must never tear down ExoPlayer / rebuffer the video. */
export function shouldRebuildNativePlaybackForSubtitleChange(
  mode: NativeSubtitleApplyMode,
): boolean {
  return mode === "rebuild-playback";
}
