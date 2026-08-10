package com.media.app

import android.util.Log
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.max

/**
 * Structured playback diagnostics for mid-play buffering investigations.
 *
 * Filter with: `adb logcat -s MediaPlaybackDiag:I MediaNativePlayer:W`
 * Or: `bash scripts/tv-playback-logs.sh`
 *
 * Lines are `key=value` so they paste cleanly into a bug report.
 */
object PlaybackDiag {
    const val TAG = "MediaPlaybackDiag"

    private val sessionCounter = AtomicLong(0)
    @Volatile private var sessionId: String = "-"
    @Volatile private var isHls: Boolean = false
    @Volatile private var urlPath: String = "-"
    @Volatile private var fileId: Int = 0
    @Volatile private var loadActive: Boolean = false
    @Volatile private var lastAheadMs: Long = -1L
    @Volatile private var bufferingSinceMs: Long = 0L
    @Volatile private var lastHealthAtMs: Long = 0L
    @Volatile private var lastLowAheadAtMs: Long = 0L
    @Volatile private var midRebufferCount: Int = 0
    @Volatile private var transferOpenCount: Int = 0
    @Volatile private var bytesThisSession: Long = 0L
    @Volatile private var liveTransferBytes: Long = 0L

    fun beginSession(
        fileId: Int,
        isHls: Boolean,
        url: String,
        startSeconds: Double,
        durationMs: Long,
        apkVersion: String,
    ) {
        sessionId = "s${sessionCounter.incrementAndGet()}"
        this.fileId = fileId
        this.isHls = isHls
        urlPath = url.substringBefore('?').substringBefore('#').takeLast(96)
        loadActive = false
        lastAheadMs = -1L
        bufferingSinceMs = 0L
        lastHealthAtMs = 0L
        lastLowAheadAtMs = 0L
        midRebufferCount = 0
        transferOpenCount = 0
        bytesThisSession = 0L
        liveTransferBytes = 0L
        event(
            "SESSION_START",
            "apk" to apkVersion,
            "fileId" to fileId,
            "isHls" to isHls,
            "startSec" to "%.1f".format(startSeconds),
            "durationMs" to durationMs,
            "url" to urlPath,
        )
    }

    fun noteTransferProgress(deltaBytes: Long) {
        if (deltaBytes > 0L) liveTransferBytes += deltaBytes
    }

    fun endSession(reason: String) {
        event(
            "SESSION_END",
            "reason" to reason,
            "midRebuffers" to midRebufferCount,
            "bytesMb" to "%.1f".format(bytesThisSession / (1024.0 * 1024.0)),
            "transfers" to transferOpenCount,
        )
        sessionId = "-"
    }

    fun onLoadControl(loading: Boolean, bufferedDurationMs: Long, allocatedBytes: Long) {
        if (loading == loadActive) return
        loadActive = loading
        lastAheadMs = bufferedDurationMs
        event(
            if (loading) "LOAD_RESUME" else "LOAD_PAUSE",
            "aheadMs" to bufferedDurationMs,
            "allocMb" to "%.1f".format(allocatedBytes / (1024.0 * 1024.0)),
        )
    }

    fun onTransferStart(uri: String, position: Long, length: Long) {
        transferOpenCount++
        val path = uri.substringBefore('?').substringBefore('#').takeLast(72)
        event(
            "HTTP_START",
            "n" to transferOpenCount,
            "pos" to position,
            "len" to length,
            "openLoads" to loadActive,
            "aheadMs" to lastAheadMs,
            "url" to path,
        )
    }

    fun onTransferEnd(bytes: Long, elapsedMs: Long) {
        bytesThisSession += max(0L, bytes)
        val kbps =
            if (elapsedMs > 0L && bytes > 0L) {
                (bytes * 8.0 / elapsedMs).toLong() // bytes/ms * 8 = kbps
            } else {
                0L
            }
        event(
            "HTTP_END",
            "bytes" to bytes,
            "elapsedMs" to elapsedMs,
            "kbps" to kbps,
            "aheadMs" to lastAheadMs,
            "loadActive" to loadActive,
        )
    }

    fun onTransferError(message: String, bytes: Long, elapsedMs: Long) {
        event(
            "HTTP_ERROR",
            "msg" to message.take(160),
            "bytes" to bytes,
            "elapsedMs" to elapsedMs,
            "aheadMs" to lastAheadMs,
            "loadActive" to loadActive,
        )
    }

    fun onSeek(targetMs: Long, fromMs: Long, aheadMs: Long) {
        event(
            "SEEK",
            "fromMs" to fromMs,
            "toMs" to targetMs,
            "aheadMs" to aheadMs,
            "loadActive" to loadActive,
        )
    }

    fun onBufferingStart(
        posMs: Long,
        aheadMs: Long,
        bufferedMs: Long,
        totalBufferedMs: Long,
        playWhenReady: Boolean,
        isPlaying: Boolean,
        seekAgeMs: Long,
        allocatedBytes: Long,
        videoH: Int,
        bitrateEstimate: Long,
    ) {
        bufferingSinceMs = System.currentTimeMillis()
        midRebufferCount++
        lastAheadMs = aheadMs
        event(
            "BUFFERING_START",
            "n" to midRebufferCount,
            "posMs" to posMs,
            "aheadMs" to aheadMs,
            "bufferedPosMs" to bufferedMs,
            "totalBufMs" to totalBufferedMs,
            "playWhenReady" to playWhenReady,
            "isPlaying" to isPlaying,
            "seekAgeMs" to seekAgeMs,
            "loadActive" to loadActive,
            "allocMb" to "%.1f".format(allocatedBytes / (1024.0 * 1024.0)),
            "videoH" to videoH,
            "bwEstKbps" to if (bitrateEstimate > 0) bitrateEstimate / 1000 else -1,
        )
    }

    fun onBufferingEnd(posMs: Long, aheadMs: Long) {
        if (bufferingSinceMs <= 0L) return
        val lasted = System.currentTimeMillis() - bufferingSinceMs
        bufferingSinceMs = 0L
        lastAheadMs = aheadMs
        event(
            "BUFFERING_END",
            "lastedMs" to lasted,
            "posMs" to posMs,
            "aheadMs" to aheadMs,
            "loadActive" to loadActive,
        )
    }

    fun onStateChanged(stateName: String, posMs: Long, aheadMs: Long, isPlaying: Boolean) {
        lastAheadMs = aheadMs
        event(
            "STATE",
            "state" to stateName,
            "posMs" to posMs,
            "aheadMs" to aheadMs,
            "isPlaying" to isPlaying,
            "loadActive" to loadActive,
        )
    }

    fun onStall(action: String, stalledMs: Long, buffering: Boolean, stateName: String, aheadMs: Long) {
        event(
            "STALL",
            "action" to action,
            "stalledMs" to stalledMs,
            "buffering" to buffering,
            "state" to stateName,
            "aheadMs" to aheadMs,
            "loadActive" to loadActive,
        )
    }

    fun onRecovery(reason: String, attempt: Int, posMs: Long, aheadMs: Long) {
        event(
            "RECOVERY",
            "reason" to reason,
            "attempt" to attempt,
            "posMs" to posMs,
            "aheadMs" to aheadMs,
        )
    }

    fun onFailThrough(reason: String, aheadMs: Long) {
        event(
            "FAIL_THROUGH",
            "reason" to reason,
            "aheadMs" to aheadMs,
            "midRebuffers" to midRebufferCount,
            "loadActive" to loadActive,
        )
    }

    fun onPlayerError(code: Int, codeName: String, message: String?, aheadMs: Long) {
        event(
            "PLAYER_ERROR",
            "code" to code,
            "name" to codeName,
            "msg" to (message ?: "-").take(160),
            "aheadMs" to aheadMs,
            "loadActive" to loadActive,
        )
    }

    /**
     * Periodic heartbeat while playing. Always every [healthIntervalMs]; also
     * logs sooner when ahead drops below [lowAheadMs] so we catch drain before
     * underrun.
     */
    fun maybeHealth(
        nowMs: Long,
        posMs: Long,
        aheadMs: Long,
        isPlaying: Boolean,
        buffering: Boolean,
        allocatedBytes: Long,
        bitrateEstimate: Long,
        healthIntervalMs: Long = 15_000L,
        lowAheadMs: Long = 30_000L,
        lowAheadIntervalMs: Long = 3_000L,
    ) {
        lastAheadMs = aheadMs
        if (!isPlaying && !buffering) return

        val dueHealth = nowMs - lastHealthAtMs >= healthIntervalMs
        val lowAhead = aheadMs in 0 until lowAheadMs
        val dueLow = lowAhead && nowMs - lastLowAheadAtMs >= lowAheadIntervalMs
        if (!dueHealth && !dueLow) return

        if (dueHealth) lastHealthAtMs = nowMs
        if (dueLow) lastLowAheadAtMs = nowMs

        event(
            if (lowAhead) "HEALTH_LOW_AHEAD" else "HEALTH",
            "posMs" to posMs,
            "aheadMs" to aheadMs,
            "isPlaying" to isPlaying,
            "buffering" to buffering,
            "loadActive" to loadActive,
            "allocMb" to "%.1f".format(allocatedBytes / (1024.0 * 1024.0)),
            "bwEstKbps" to if (bitrateEstimate > 0) bitrateEstimate / 1000 else -1,
            "bytesMb" to "%.1f".format(bytesThisSession / (1024.0 * 1024.0)),
            "liveMb" to "%.1f".format(liveTransferBytes / (1024.0 * 1024.0)),
        )
    }

    fun event(name: String, vararg fields: Pair<String, Any?>) {
        val sb = StringBuilder(128)
        sb.append("event=").append(name)
        sb.append(" session=").append(sessionId)
        sb.append(" fileId=").append(fileId)
        sb.append(" isHls=").append(isHls)
        for ((k, v) in fields) {
            sb.append(' ').append(k).append('=').append(v ?: "-")
        }
        Log.i(TAG, sb.toString())
    }
}
