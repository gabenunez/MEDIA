package com.media.app

import androidx.media3.common.C
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.HttpDataSource

/**
 * Caps each progressive HTTP open to [maxChunkBytes] so ExoPlayer cannot hold a
 * single unbounded Range forever.
 *
 * Logs showed mid-play underruns where one `len=-1` transfer stayed open for
 * ~8 minutes, slowed below realtime, then hit SocketTimeoutException — the
 * ~110s buffer drained to zero while `loadActive=true`. Finite chunks force a
 * fresh Range after each block so a hung socket cannot outlive one chunk +
 * read timeout.
 */
class ChunkedHttpDataSource(
    private val upstream: HttpDataSource,
    private val maxChunkBytes: Long,
) : HttpDataSource by upstream {
    override fun open(dataSpec: DataSpec): Long {
        val length = dataSpec.length
        val needsClamp = length == C.LENGTH_UNSET.toLong() || length > maxChunkBytes
        val openSpec =
            if (needsClamp) {
                dataSpec.buildUpon().setLength(maxChunkBytes).build()
            } else {
                dataSpec
            }
        return upstream.open(openSpec)
    }
}

class ChunkedHttpDataSourceFactory(
    private val upstream: HttpDataSource.Factory,
    private val maxChunkBytes: Long,
) : HttpDataSource.Factory {
    override fun createDataSource(): HttpDataSource {
        return ChunkedHttpDataSource(upstream.createDataSource(), maxChunkBytes)
    }

    override fun setDefaultRequestProperties(
        defaultRequestProperties: MutableMap<String, String>,
    ): HttpDataSource.Factory {
        upstream.setDefaultRequestProperties(defaultRequestProperties)
        return this
    }
}
