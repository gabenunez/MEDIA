let sharedContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

/** Resume the shared AudioContext — safe to call before theme playback. */
export async function ensureAudioUnlocked(): Promise<void> {
  const ctx = getSharedAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

export function closeSharedAudioContext(): void {
  void sharedContext?.close();
  sharedContext = null;
}
