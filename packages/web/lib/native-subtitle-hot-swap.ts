/** How the Android TV shell should apply a caption change. */
export type NativeSubtitleApplyMode = "vtt-overlay" | "url-overlay" | "rebuild-playback";

/**
 * Android Binder UTF-16 payloads fail around 1MB. A 2-hour track sent over
 * `setSubtitleVtt` truncates to early cues — captions work, then vanish.
 */
export const JS_BRIDGE_VTT_MAX_CHARS = 80_000;

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

export function canSendVttOverJsBridge(vtt: string | null | undefined): boolean {
  return typeof vtt === "string" && vtt.length > 0 && vtt.length <= JS_BRIDGE_VTT_MAX_CHARS;
}

/** Prefer a URL fetch on device when the VTT would not survive the JS bridge. */
export function resolveNativeSubtitleTransport(options: {
  vtt?: string | null;
  subtitleUrl?: string;
}): "off" | "vtt" | "url" {
  if (!options.vtt && !options.subtitleUrl) return "off";
  if (canSendVttOverJsBridge(options.vtt)) return "vtt";
  if (options.subtitleUrl) return "url";
  return "vtt";
}
