package com.media.app

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.provider.BaseColumns
import android.util.Log
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.TvContractCompat.PreviewPrograms
import androidx.tvprovider.media.tv.TvContractCompat.WatchNextPrograms
import androidx.tvprovider.media.tv.WatchNextProgram

/**
 * Publishes continue-watching to the launcher.
 *
 * Play Next (Watch Next) works on Android TV and the emulator. Google TV
 * hardware only shows certified apps there, so we also publish a preview
 * channel — that is the row a sideloaded APK can actually appear in.
 *
 * Real TVs often allow insert but not query, so a URI lookup every 15s used
 * to create duplicate cards. Persist the row id and delete extras.
 */
class WatchNextManager(context: Context) {
    private val appContext = context.applicationContext
    private val resolver = appContext.contentResolver
    private val prefs: SharedPreferences =
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val homeChannel = HomeChannelManager(appContext)

    fun update(payload: PlaybackPayload, positionMs: Long, durationMs: Long, ended: Boolean = false) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val contentId = WatchNextPolicy.contentId(payload.itemType, payload.fileId)
        if (WatchNextPolicy.shouldRemove(ended, positionMs, durationMs)) {
            remove(contentId)
            return
        }
        if (durationMs <= 0L) return

        val launch = playbackLaunchIntent(payload)
        val intentUri = playbackIntent(payload)
        val values = WatchNextProgram.Builder()
            .setType(
                if (payload.itemType == "episode") {
                    PreviewPrograms.TYPE_TV_EPISODE
                } else {
                    PreviewPrograms.TYPE_MOVIE
                },
            )
            .setWatchNextType(WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
            .setInternalProviderId(contentId)
            .setContentId(contentId)
            .setTitle(payload.title)
            .setDescription(payload.title)
            .setDurationMillis(durationMs.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
            .setLastPlaybackPositionMillis(
                WatchNextPolicy.clampedPositionMs(positionMs, durationMs)
                    .coerceAtMost(Int.MAX_VALUE.toLong())
                    .toInt(),
            )
            .setLastEngagementTimeUtcMillis(System.currentTimeMillis())
            .setPosterArtAspectRatio(PreviewPrograms.ASPECT_RATIO_MOVIE_POSTER)
            .setIntent(launch)
            .apply {
                payload.posterUrl?.let { setPosterArtUri(Uri.parse(it)) }
            }
            .build()
            .toContentValues()

        try {
            upsert(contentId, intentUri, values)
        } catch (error: SecurityException) {
            Log.w(TAG, "Watch Next insert blocked", error)
        } catch (error: IllegalArgumentException) {
            Log.w(TAG, "Watch Next insert rejected", error)
        }
        homeChannel.update(payload, positionMs, durationMs, ended)
    }

    private fun upsert(contentId: String, intentUri: Uri, values: android.content.ContentValues) {
        val knownId = prefs.getLong(prefKey(contentId), 0L)
        if (knownId > 0L) {
            val updated = resolver.update(
                TvContractCompat.buildWatchNextProgramUri(knownId),
                values,
                null,
                null,
            )
            if (updated > 0) {
                deleteExtras(contentId, intentUri, keepId = knownId)
                return
            }
        }

        deleteAll(contentId, intentUri)
        val inserted = resolver.insert(WatchNextPrograms.CONTENT_URI, values) ?: return
        val insertedId = ContentUris.parseId(inserted)
        remember(contentId, insertedId)
        deleteExtras(contentId, intentUri, keepId = insertedId)
    }

    private fun remove(contentId: String) {
        val intentUri = playbackIntentFromContentId(contentId)
        deleteAll(contentId, intentUri)
        prefs.edit().remove(prefKey(contentId)).apply()
        homeChannel.remove(contentId)
    }

    private fun deleteAll(contentId: String, intentUri: Uri?) {
        val knownId = prefs.getLong(prefKey(contentId), 0L)
        if (knownId > 0L) deleteId(knownId)
        try {
            val selection = StringBuilder("${WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID} = ? OR ${WatchNextPrograms.COLUMN_CONTENT_ID} = ?")
            val args = mutableListOf(contentId, contentId)
            if (intentUri != null) {
                selection.append(" OR ${WatchNextPrograms.COLUMN_INTENT_URI} = ?")
                args += intentUri.toString()
            }
            resolver.delete(WatchNextPrograms.CONTENT_URI, selection.toString(), args.toTypedArray())
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun deleteExtras(contentId: String, intentUri: Uri, keepId: Long) {
        try {
            val selection = StringBuilder(
                "${BaseColumns._ID} != ? AND (${WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID} = ? OR ${WatchNextPrograms.COLUMN_CONTENT_ID} = ?",
            )
            val args = mutableListOf(keepId.toString(), contentId, contentId)
            if (intentUri.toString().isNotEmpty()) {
                selection.append(" OR ${WatchNextPrograms.COLUMN_INTENT_URI} = ?")
                args += intentUri.toString()
            }
            selection.append(")")
            resolver.delete(WatchNextPrograms.CONTENT_URI, selection.toString(), args.toTypedArray())
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }
        findProgramIds(contentId, intentUri)
            .filter { it != keepId }
            .forEach(::deleteId)
    }

    private fun deleteId(id: Long) {
        if (id <= 0L) return
        try {
            resolver.delete(TvContractCompat.buildWatchNextProgramUri(id), null, null)
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun findProgramIds(contentId: String, intentUri: Uri?): List<Long> {
        val selection = StringBuilder()
        val args = mutableListOf<String>()
        selection.append("${WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID} = ?")
        args += contentId
        selection.append(" OR ${WatchNextPrograms.COLUMN_CONTENT_ID} = ?")
        args += contentId
        if (intentUri != null) {
            selection.append(" OR ${WatchNextPrograms.COLUMN_INTENT_URI} = ?")
            args += intentUri.toString()
        }
        return try {
            resolver.query(
                WatchNextPrograms.CONTENT_URI,
                arrayOf(BaseColumns._ID),
                selection.toString(),
                args.toTypedArray(),
                null,
            )?.use { cursor ->
                val ids = mutableListOf<Long>()
                val idIndex = cursor.getColumnIndexOrThrow(BaseColumns._ID)
                while (cursor.moveToNext()) {
                    ids += cursor.getLong(idIndex)
                }
                ids
            } ?: emptyList()
        } catch (_: SecurityException) {
            emptyList()
        } catch (_: IllegalArgumentException) {
            emptyList()
        }
    }

    private fun remember(contentId: String, id: Long) {
        if (id <= 0L) return
        prefs.edit().putLong(prefKey(contentId), id).apply()
    }

    private fun playbackIntent(payload: PlaybackPayload): Uri {
        return Uri.Builder()
            .scheme("media")
            .authority("watch")
            .appendQueryParameter("type", payload.itemType)
            .appendQueryParameter("fileId", payload.fileId.toString())
            .build()
    }

    private fun playbackLaunchIntent(payload: PlaybackPayload): Intent {
        return Intent(Intent.ACTION_VIEW, playbackIntent(payload)).apply {
            setClass(appContext, MainActivity::class.java)
            setPackage(appContext.packageName)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
    }

    private fun playbackIntentFromContentId(contentId: String): Uri? {
        val parts = contentId.split(':', limit = 2)
        if (parts.size != 2) return null
        val fileId = parts[1].toIntOrNull() ?: return null
        return playbackIntent(
            PlaybackPayload(
                url = "",
                title = "",
                posterUrl = null,
                fileId = fileId,
                itemType = parts[0],
                startSeconds = 0.0,
                durationMs = 0L,
                isHls = false,
                subtitleUrl = null,
                isHdr = false,
                dolbyVision = false,
                handoff = false,
            ),
        )
    }

    private fun prefKey(contentId: String) = "id:$contentId"

    companion object {
        private const val TAG = "MediaWatchNext"
        private const val PREFS = "watch_next"
    }
}
