/**
 * Phone offline encodes — sized for iOS Home Screen PWAs.
 *
 * Safari's per-origin website data stays reliable around 500 MB (QuotaExceeded
 * and eviction get much more aggressive above that). Each downloaded title is
 * therefore planned to stay under {@link IPHONE_OFFLINE_MAX_BYTES}.
 *
 * HEVC (hvc1) is preferred on iPhone: same watchable 480p at a much lower
 * bitrate than H.264, which is what actually makes a 2-hour movie fit.
 */

export const IPHONE_OFFLINE_MAX_BYTES = 480 * 1024 * 1024;
export const OFFLINE_AUDIO_BITRATE = 64_000;
export const OFFLINE_CONTAINER_OVERHEAD = 0.03;

export type OfflineVideoCodec = "hevc" | "h264";
export type OfflineEncodeHeight = 360 | 480 | 720;

export interface OfflineEncodePlan {
  height: OfflineEncodeHeight;
  videoBitrate: number;
  audioBitrate: number;
  codec: OfflineVideoCodec;
  crf: number;
  estimatedBytes: number;
  maxBytes: number;
}

export interface PlanOfflineEncodeInput {
  durationMs: number;
  sourceHeight?: number | null;
  hevcAvailable: boolean;
}

function clampHeightToSource(
  height: OfflineEncodeHeight,
  sourceHeight?: number | null,
): OfflineEncodeHeight {
  if (!sourceHeight || sourceHeight <= 0) return height;
  if (sourceHeight < 360) return 360;
  if (sourceHeight < 480) return 360;
  if (sourceHeight < 720 && height === 720) return 480;
  return height;
}

function qualityCeilingBps(
  height: OfflineEncodeHeight,
  codec: OfflineVideoCodec,
): number {
  // HEVC needs less bitrate for the same picture; keep H.264 a bit higher.
  const hevcFactor = codec === "hevc" ? 0.7 : 1;
  if (height === 720) return Math.round(1_200_000 * hevcFactor);
  if (height === 480) return Math.round(700_000 * hevcFactor);
  return Math.round(400_000 * hevcFactor);
}

function pickHeight(
  videoBudgetBps: number,
  codec: OfflineVideoCodec,
): OfflineEncodeHeight {
  // HEVC is ~1.7× more efficient, so the same budget can justify a higher tier.
  const effective = videoBudgetBps * (codec === "hevc" ? 1.7 : 1);
  if (effective >= 900_000) return 720;
  if (effective >= 280_000) return 480;
  return 360;
}

function crfFor(height: OfflineEncodeHeight, codec: OfflineVideoCodec): number {
  if (codec === "hevc") {
    if (height === 720) return 26;
    if (height === 480) return 28;
    return 30;
  }
  if (height === 720) return 27;
  if (height === 480) return 30;
  return 32;
}

export function planOfflineEncode(
  input: PlanOfflineEncodeInput,
): OfflineEncodePlan {
  const durationSec = Math.max((input.durationMs || 0) / 1000, 30);
  const maxBytes = IPHONE_OFFLINE_MAX_BYTES;
  const budgetBits = maxBytes * 8 * (1 - OFFLINE_CONTAINER_OVERHEAD);
  const budgetBps = budgetBits / durationSec;
  const audioBitrate = OFFLINE_AUDIO_BITRATE;
  const videoBudget = Math.max(120_000, budgetBps - audioBitrate);

  const codec: OfflineVideoCodec = input.hevcAvailable ? "hevc" : "h264";
  const height = clampHeightToSource(
    pickHeight(videoBudget, codec),
    input.sourceHeight,
  );
  const videoBitrate = Math.max(
    120_000,
    Math.min(videoBudget, qualityCeilingBps(height, codec)),
  );
  const crf = crfFor(height, codec);

  const estimatedBytes = Math.min(
    maxBytes,
    Math.round(((videoBitrate + audioBitrate) * durationSec) / 8),
  );

  return {
    height,
    videoBitrate,
    audioBitrate,
    codec,
    crf,
    estimatedBytes,
    maxBytes,
  };
}

export function offlineRecordId(
  type: "movie" | "episode",
  fileId: number,
): string {
  return `${type}-${fileId}`;
}

export function ffmpegBitrateKbps(bps: number): string {
  return `${Math.max(1, Math.round(bps / 1000))}k`;
}
