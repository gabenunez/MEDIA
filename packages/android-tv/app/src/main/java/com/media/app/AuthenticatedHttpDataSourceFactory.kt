package com.media.app

import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

/** Injects session cookie on every HTTP request (manifest + HLS segments). */
class AuthenticatedHttpDataSourceFactory(
    private val sessionToken: String?,
    private val transferListener: DiagTransferListener? = null,
    private val readTimeoutMs: Int = 120_000,
) : HttpDataSource.Factory {
    private val upstream = DefaultHttpDataSource.Factory()
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(30_000)
        .setReadTimeoutMs(readTimeoutMs)
        .setUserAgent("MediaAndroidTV/1.1 ExoPlayer")
        .apply {
            if (transferListener != null) {
                setTransferListener(transferListener)
            }
        }

    override fun createDataSource(): HttpDataSource {
        val dataSource = upstream.createDataSource()
        if (!sessionToken.isNullOrBlank()) {
            dataSource.setRequestProperty(
                "Cookie",
                "media_session=$sessionToken; reel_session=$sessionToken",
            )
        }
        return dataSource
    }

    override fun setDefaultRequestProperties(
        defaultRequestProperties: MutableMap<String, String>,
    ): HttpDataSource.Factory {
        upstream.setDefaultRequestProperties(defaultRequestProperties)
        return this
    }
}

/**
 * @param chunkBytes When > 0, clamp progressive Range opens to this size so a
 *   hung socket cannot outlive one chunk. Use 0 for HLS (already segmented).
 */
fun authenticatedMediaSourceFactory(
    sessionToken: String?,
    transferListener: DiagTransferListener? = null,
    chunkBytes: Long = 0L,
    readTimeoutMs: Int = if (chunkBytes > 0L) 45_000 else 120_000,
): DefaultMediaSourceFactory {
    val authed = AuthenticatedHttpDataSourceFactory(sessionToken, transferListener, readTimeoutMs)
    val factory: HttpDataSource.Factory =
        if (chunkBytes > 0L) {
            ChunkedHttpDataSourceFactory(authed, chunkBytes)
        } else {
            authed
        }
    return DefaultMediaSourceFactory(factory)
}
