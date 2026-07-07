/** Absolute media time (seconds) that HLS `video.currentTime` 0 maps to. */
export function resolveHlsSubtitleTimelineOffset(options: {
  streamStartSeconds: number | null;
  hlsStartOffset: number;
  initialResumeSeconds: number | null;
}): number {
  const { streamStartSeconds, hlsStartOffset, initialResumeSeconds } = options;
  if (streamStartSeconds != null) return streamStartSeconds;
  if (hlsStartOffset > 0) return hlsStartOffset;
  return initialResumeSeconds ?? 0;
}
