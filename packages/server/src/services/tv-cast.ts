export interface TvCastRequest {
  fileId: number;
  type: "movie" | "episode";
  title?: string;
  posterPath?: string | null;
  mediaId?: string | null;
  startTimeMs?: number;
}

interface TvPresence {
  lastSeenMs: number;
  label: string;
}

const TV_PRESENCE_TTL_MS = 90_000;
const PENDING_CAST_TTL_MS = 120_000;

const tvPresenceBySession = new Map<string, TvPresence>();
const pendingCastBySession = new Map<
  string,
  TvCastRequest & { createdAtMs: number }
>();

function pruneExpired() {
  const now = Date.now();
  for (const [session, presence] of tvPresenceBySession) {
    if (now - presence.lastSeenMs > TV_PRESENCE_TTL_MS) {
      tvPresenceBySession.delete(session);
    }
  }
  for (const [session, pending] of pendingCastBySession) {
    if (now - pending.createdAtMs > PENDING_CAST_TTL_MS) {
      pendingCastBySession.delete(session);
    }
  }
}

export function recordTvPresence(sessionToken: string, label = "MEDIA! TV") {
  pruneExpired();
  tvPresenceBySession.set(sessionToken, {
    lastSeenMs: Date.now(),
    label,
  });
}

export function isTvPresent(sessionToken: string): boolean {
  pruneExpired();
  const presence = tvPresenceBySession.get(sessionToken);
  if (!presence) return false;
  return Date.now() - presence.lastSeenMs <= TV_PRESENCE_TTL_MS;
}

export function getTvPresenceLabel(sessionToken: string): string | null {
  pruneExpired();
  return tvPresenceBySession.get(sessionToken)?.label ?? null;
}

export function queueTvCast(sessionToken: string, request: TvCastRequest) {
  pruneExpired();
  pendingCastBySession.set(sessionToken, {
    ...request,
    createdAtMs: Date.now(),
  });
}

export function consumePendingTvCast(
  sessionToken: string,
): TvCastRequest | null {
  pruneExpired();
  const pending = pendingCastBySession.get(sessionToken);
  if (!pending) return null;
  pendingCastBySession.delete(sessionToken);
  if (Date.now() - pending.createdAtMs > PENDING_CAST_TTL_MS) {
    return null;
  }
  const { createdAtMs: _, ...request } = pending;
  return request;
}
