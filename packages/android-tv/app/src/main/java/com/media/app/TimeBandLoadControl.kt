package com.media.app

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.analytics.PlayerId
import androidx.media3.exoplayer.upstream.DefaultAllocator
import kotlin.math.max
import kotlin.math.min

/**
 * DefaultLoadControl with a critical fix for progressive / high-bitrate VOD.
 *
 * Media3 [DefaultLoadControl.shouldContinueLoading] does:
 *   buffered < min  → keep loading (if prioritizeTime, even past the byte cap)
 *   buffered >= max **OR bytes >= target** → stop loading
 *   else → keep prior state
 *
 * With prioritizeTime=true we fill past the byte cap until [minBufferMs]. The
 * moment buffered crosses min, `targetBufferSizeReached` is already true for
 * typical 4K bitrates (~380MB holds only ~40–60s). Loading then stops at **min**
 * instead of **max**, collapsing the min/max hysteresis band into min-watermark
 * Range cancel/reopen thrash on HTTP Range streams — mid-play BUFFERING even on a
 * stable LAN.
 *
 * This subclass keeps time-band hysteresis, and adds a hard [maxAllocatedBytes]
 * ceiling that may pause loading only after the min band is met — so UHD cannot
 * grow the Java heap without bound while HD still fills toward maxBufferMs.
 *
 * Callers must keep minBufferMs under what maxAllocatedBytes can hold at the
 * worst expected bitrate. If min sits above the byte ceiling (e.g. 40s min with
 * ~25s of 4K in 288MB), loading always stops at min and HTTP Range thrash returns.
 */
@UnstableApi
class TimeBandLoadControl private constructor(
    private val allocator: DefaultAllocator,
    private val minBufferMs: Int,
    private val maxBufferMs: Int,
    bufferForPlaybackMs: Int,
    bufferForPlaybackAfterRebufferMs: Int,
    targetBufferBytes: Int,
    private val maxAllocatedBytes: Int,
    backBufferDurationMs: Int,
    retainBackBufferFromKeyframe: Boolean,
) : DefaultLoadControl(
        allocator,
        minBufferMs,
        maxBufferMs,
        bufferForPlaybackMs,
        bufferForPlaybackAfterRebufferMs,
        targetBufferBytes,
        /* prioritizeTimeOverSizeThresholds= */ true,
        backBufferDurationMs,
        retainBackBufferFromKeyframe,
    ) {
    private val minBufferUs = Util.msToUs(minBufferMs.toLong())
    private val maxBufferUs = Util.msToUs(maxBufferMs.toLong())
    private var isLoading = false

    fun allocatedBytes(): Long = allocator.totalBytesAllocated.toLong()

    override fun onPrepared(playerId: PlayerId) {
        isLoading = false
        super.onPrepared(playerId)
    }

    override fun shouldContinueLoading(parameters: LoadControl.Parameters): Boolean {
        var minUs = minBufferUs
        if (parameters.playbackSpeed > 1f) {
            val mediaDurationMinBufferUs =
                Util.getMediaDurationForPlayoutDuration(minUs, parameters.playbackSpeed)
            minUs = min(mediaDurationMinBufferUs, maxBufferUs)
        }
        // Match DefaultLoadControl: never treat the floor as < 500ms.
        minUs = max(minUs, 500_000L)

        val wasLoading = isLoading
        isLoading =
            TimeBandLoadingPolicy.shouldContinueLoading(
                bufferedUs = parameters.bufferedDurationUs,
                minBufferUs = minUs,
                maxBufferUs = maxBufferUs,
                allocatedBytes = allocatedBytes(),
                maxAllocatedBytes = maxAllocatedBytes.toLong(),
                wasLoading = wasLoading,
            )
        if (isLoading != wasLoading) {
            val bufferedMs = parameters.bufferedDurationUs / 1000L
            PlaybackDiag.onLoadControl(isLoading, bufferedMs, allocatedBytes())
        }
        return isLoading
    }

    companion object {
        fun create(
            minBufferMs: Int,
            maxBufferMs: Int,
            bufferForPlaybackMs: Int,
            bufferForPlaybackAfterRebufferMs: Int,
            targetBufferBytes: Int,
            backBufferDurationMs: Int,
            maxAllocatedBytes: Int = targetBufferBytes,
        ): TimeBandLoadControl {
            return TimeBandLoadControl(
                DefaultAllocator(/* trimOnReset= */ true, C.DEFAULT_BUFFER_SEGMENT_SIZE),
                minBufferMs,
                maxBufferMs,
                bufferForPlaybackMs,
                bufferForPlaybackAfterRebufferMs,
                targetBufferBytes,
                maxAllocatedBytes,
                backBufferDurationMs,
                retainBackBufferFromKeyframe = true,
            )
        }
    }
}
