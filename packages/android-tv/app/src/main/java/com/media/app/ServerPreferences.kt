package com.media.app

import android.content.Context
import java.net.URI

object ServerPreferences {
    private const val PREFS_NAME = "media_tv"
    private const val KEY_SERVER_URL = "server_url"
    private const val DEFAULT_LAN_PORT = "8096"

    fun getServerUrl(context: Context): String? {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SERVER_URL, null)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    }

    fun saveServerUrl(context: Context, url: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_URL, url.trim())
            .apply()
    }

    fun clearServerUrl(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_SERVER_URL)
            .apply()
        SessionPreferences.clearSessionToken(context)
    }

    /**
     * Build a server base URL from the setup/pairing fields.
     *
     * Supports:
     * - Full URLs with or without an explicit port: `https://host/reel`
     * - Host + optional path without scheme: `host/reel` → `https://host/reel` (public hosts)
     * - LAN hosts with empty port → `http://host:8096`
     * - Explicit port field when the address has no scheme
     */
    fun normalizeServerUrl(hostInput: String, portInput: String): String? {
        val raw = hostInput.trim()
        if (raw.isEmpty()) return null

        if (raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true)) {
            return normalizeAbsoluteUrl(raw)
        }

        val remainder = raw.removePrefix("//").trim()
        if (remainder.isEmpty()) return null

        val pathIndex = authorityPathSplitIndex(remainder)
        val authority = if (pathIndex >= 0) remainder.substring(0, pathIndex) else remainder
        val path = if (pathIndex >= 0) remainder.substring(pathIndex).trimEnd('/') else ""
        if (authority.isEmpty()) return null

        val (hostname, embeddedPort) = splitAuthority(authority) ?: return null
        val portField = portInput.trim()
        val explicitPort = portField.ifEmpty { embeddedPort }

        val lan = isLanOrLocalHost(hostname)
        val scheme = when {
            explicitPort == "443" -> "https"
            explicitPort == "80" -> "http"
            !lan && explicitPort == null -> "https"
            else -> "http"
        }

        val port = when {
            explicitPort != null -> explicitPort
            lan -> DEFAULT_LAN_PORT
            else -> null
        }

        val hostWithPort = formatHostWithPort(hostname, port, scheme)
        return "$scheme://$hostWithPort$path".trimEnd('/')
    }

    private fun normalizeAbsoluteUrl(raw: String): String? {
        return try {
            val uri = URI(raw.trim())
            val scheme = uri.scheme?.lowercase() ?: return null
            if (scheme != "http" && scheme != "https") return null
            val host = uri.host ?: return null
            val path = (uri.path ?: "").trimEnd('/')
            val port = uri.port.takeIf { it > 0 }
            val hostWithPort = formatHostWithPort(host, port?.toString(), scheme)
            val query = uri.rawQuery?.takeIf { it.isNotEmpty() }?.let { "?$it" } ?: ""
            "$scheme://$hostWithPort$path$query".trimEnd('/')
        } catch (_: Exception) {
            raw.trim().trimEnd('/').ifEmpty { null }
        }
    }

    /** Index of the first `/` that starts the path (not inside an IPv6 literal). */
    private fun authorityPathSplitIndex(value: String): Int {
        if (value.startsWith("[")) {
            val end = value.indexOf(']')
            if (end < 0) return value.indexOf('/')
            val slash = value.indexOf('/', startIndex = end + 1)
            return slash
        }
        return value.indexOf('/')
    }

    private fun splitAuthority(authority: String): Pair<String, String?>? {
        if (authority.startsWith("[")) {
            val end = authority.indexOf(']')
            if (end <= 1) return null
            val host = authority.substring(1, end)
            if (host.isEmpty()) return null
            val rest = authority.substring(end + 1)
            if (rest.isEmpty()) return host to null
            if (!rest.startsWith(":")) return null
            val port = rest.removePrefix(":")
            if (port.isEmpty() || port.toIntOrNull() == null) return null
            return host to port
        }

        val colon = authority.lastIndexOf(':')
        if (colon > 0 && authority.indexOf(':') == colon) {
            val host = authority.substring(0, colon)
            val port = authority.substring(colon + 1)
            if (host.isEmpty()) return null
            if (port.isNotEmpty() && port.toIntOrNull() != null) {
                return host to port
            }
        }

        return if (authority.isEmpty()) null else authority to null
    }

    private fun formatHostWithPort(host: String, port: String?, scheme: String): String {
        val hostOut = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
        val normalizedPort = port?.trim()?.takeIf { it.isNotEmpty() } ?: return hostOut
        if (scheme == "https" && normalizedPort == "443") return hostOut
        if (scheme == "http" && normalizedPort == "80") return hostOut
        return "$hostOut:$normalizedPort"
    }

    internal fun isLanOrLocalHost(host: String): Boolean {
        val h = host.trim().lowercase().removePrefix("[").removeSuffix("]")
        if (h.isEmpty()) return false
        if (h == "localhost" || h == "127.0.0.1" || h == "::1") return true
        if (h.endsWith(".local")) return true
        if (!h.contains('.') && !h.contains(':')) return true

        val parts = h.split('.')
        if (parts.size == 4) {
            val nums = parts.map { it.toIntOrNull() }
            if (nums.all { it != null }) {
                val a = nums[0]!!
                val b = nums[1]!!
                if (a == 10) return true
                if (a == 127) return true
                if (a == 192 && b == 168) return true
                if (a == 172 && b in 16..31) return true
            }
        }

        return false
    }
}
