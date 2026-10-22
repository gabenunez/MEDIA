package com.media.app

import android.content.Context
import android.media.MediaFormat
import android.os.Build
import android.util.Log
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.mediacodec.MediaCodecAdapter

/**
 * Media3 1.4 has no setter for the codec adapter. Override the protected
 * factory so video configure can drop color keys this TV's decoder rejects.
 */
internal class TvRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
    override fun getCodecAdapterFactory(): MediaCodecAdapter.Factory {
        return TolerantMediaCodecAdapterFactory(super.getCodecAdapterFactory())
    }
}

/**
 * Hisense MStar's OMX.MS.AVC.Decoder throws from MediaCodec.configure when the
 * format includes color metadata (this set reports BT.709 with SMPTE 170M).
 * Retry that one configure without the color keys.
 */
internal class TolerantMediaCodecAdapterFactory(
    private val delegate: MediaCodecAdapter.Factory,
) : MediaCodecAdapter.Factory {
    override fun createAdapter(configuration: MediaCodecAdapter.Configuration): MediaCodecAdapter {
        return try {
            delegate.createAdapter(configuration)
        } catch (error: IllegalArgumentException) {
            if (!stripColorInfo(configuration.mediaFormat)) throw error
            Log.w(TAG, "codec configure rejected color info; retrying without it")
            delegate.createAdapter(configuration)
        }
    }

    companion object {
        private const val TAG = "MediaNativePlayer"

        internal val COLOR_KEYS =
            arrayOf(
                MediaFormat.KEY_COLOR_TRANSFER,
                MediaFormat.KEY_COLOR_STANDARD,
                MediaFormat.KEY_COLOR_RANGE,
                MediaFormat.KEY_HDR_STATIC_INFO,
            )

        internal fun stripColorInfo(format: MediaFormat): Boolean {
            if (Build.VERSION.SDK_INT < 29) return false
            var removed = false
            for (key in COLOR_KEYS) {
                if (!format.containsKey(key)) continue
                format.removeKey(key)
                removed = true
            }
            return removed
        }
    }
}
