package com.media.app

/** Keep the outgoing quality playing until the incoming stream can take over. */
object QualityHandoff {
    const val MIN_AHEAD_MS = 750L

    fun elapsedMs(outgoingPositionMs: Long, originPositionMs: Long): Long {
        return (outgoingPositionMs - originPositionMs).coerceAtLeast(0L)
    }

    fun incomingSeekMs(
        outgoingPositionMs: Long,
        originPositionMs: Long,
        incomingIsHls: Boolean,
        incomingStartSeconds: Double,
    ): Long {
        val elapsed = elapsedMs(outgoingPositionMs, originPositionMs)
        return if (incomingIsHls) {
            elapsed
        } else {
            (incomingStartSeconds * 1000.0).toLong().coerceAtLeast(0L) + elapsed
        }
    }

    fun canSwap(
        incomingReady: Boolean,
        incomingBufferedPositionMs: Long,
        targetMs: Long,
        minAheadMs: Long = MIN_AHEAD_MS,
    ): Boolean {
        if (!incomingReady) return false
        return incomingBufferedPositionMs >= targetMs + minAheadMs
    }
}
