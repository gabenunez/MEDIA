package com.media.app

import java.net.URI

/**
 * Normalize media URLs before ExoPlayer loads them.
 *
 * Older web builds double-applied the public prefix, producing paths like
 * `/reel/reel/api/stream/...` which 404 behind reverse proxies.
 */
object PlaybackUrl {
    fun sanitize(url: String): String {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) return trimmed

        return try {
            val uri = URI(trimmed)
            val path = uri.rawPath ?: return trimmed
            val segments = path.split('/').filter { it.isNotEmpty() }
            if (segments.size < 3) return trimmed
            if (segments[0] != segments[1]) return trimmed
            // Only collapse when the duplicated segment is a short basePath
            // sitting in front of app routes (api/_next).
            if (segments[2] != "api" && segments[2] != "_next") return trimmed

            val collapsedPath = "/" + segments.drop(1).joinToString("/")
            URI(
                uri.scheme,
                uri.authority,
                collapsedPath,
                uri.query,
                uri.fragment,
            ).toString()
        } catch (_: Exception) {
            trimmed
        }
    }
}
