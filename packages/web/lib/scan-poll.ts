export const SCAN_POLL_MS = 1500;
export const IDLE_POLL_MS = 8000;
/** TV WebView: keep scan awareness without chatting to /api/status every few seconds. */
export const TV_IDLE_POLL_MS = 60_000;

/** Delay before the next status poll, or null to wait for visibility instead. */
export function scanPollDelayMs(options: {
  scanning: boolean;
  tv: boolean;
  hidden?: boolean;
}): number | null {
  if (options.hidden) return null;
  if (options.scanning) return SCAN_POLL_MS;
  return options.tv ? TV_IDLE_POLL_MS : IDLE_POLL_MS;
}
