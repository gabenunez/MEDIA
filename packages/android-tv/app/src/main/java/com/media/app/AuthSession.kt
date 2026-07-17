package com.media.app

import android.content.Context
import android.webkit.CookieManager
import java.net.URI

object AuthSession {
    /** Resolve auth token from WebView cookies first, then persisted prefs. */
    fun resolveSessionToken(context: Context, serverUrl: String): String? {
        val cookieManager = CookieManager.getInstance()
        for (candidate in cookieLookupUrls(serverUrl)) {
            val fromCookie = parseSessionFromCookie(cookieManager.getCookie(candidate))
            if (!fromCookie.isNullOrBlank()) {
                SessionPreferences.saveSessionToken(context, fromCookie)
                return fromCookie
            }
        }

        return SessionPreferences.getSessionToken(context)
    }

    fun requestHeaders(token: String?): Map<String, String> {
        if (token.isNullOrBlank()) return emptyMap()
        return mapOf("Cookie" to "media_session=$token; reel_session=$token")
    }

    /** Try path variants — CookieManager can miss cookies when the saved URL omits `/`. */
    internal fun cookieLookupUrls(serverUrl: String): List<String> {
        val trimmed = serverUrl.trim().trimEnd('/')
        if (trimmed.isEmpty()) return emptyList()

        val urls = linkedSetOf(
            trimmed,
            "$trimmed/",
        )

        try {
            val uri = URI(trimmed)
            if (!uri.scheme.isNullOrBlank() && !uri.host.isNullOrBlank()) {
                val port = if (uri.port > 0) ":${uri.port}" else ""
                val origin = "${uri.scheme}://${uri.host}$port"
                urls.add(origin)
                urls.add("$origin/")
            }
        } catch (_: Exception) {
            // Keep the trimmed variants only.
        }

        return urls.toList()
    }

    private fun parseSessionFromCookie(cookieHeader: String?): String? {
        if (cookieHeader.isNullOrBlank()) return null

        for (part in cookieHeader.split(";")) {
            val trimmed = part.trim()
            for (prefix in listOf("media_session=", "reel_session=")) {
                if (trimmed.startsWith(prefix)) {
                    val value = trimmed.removePrefix(prefix).trim()
                    if (value.isNotEmpty() && value != "deleted") {
                        return value
                    }
                }
            }
        }

        return null
    }
}
