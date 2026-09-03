package com.media.app

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Build
import android.provider.BaseColumns
import android.util.Log
import androidx.appcompat.content.res.AppCompatResources
import androidx.tvprovider.media.tv.Channel
import androidx.tvprovider.media.tv.ChannelLogoUtils
import androidx.tvprovider.media.tv.PreviewProgram
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.TvContractCompat.Channels
import androidx.tvprovider.media.tv.TvContractCompat.PreviewPrograms

/**
 * Google TV hides uncertified apps from the system Play Next row. A preview
 * channel is the row sideloaded apps are actually allowed to show on home.
 */
class HomeChannelManager(private val context: Context) {
    private val resolver = context.contentResolver
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun update(payload: PlaybackPayload, positionMs: Long, durationMs: Long, ended: Boolean = false) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val contentId = WatchNextPolicy.contentId(payload.itemType, payload.fileId)
        if (WatchNextPolicy.shouldRemove(ended, positionMs, durationMs)) {
            remove(contentId)
            return
        }
        if (durationMs <= 0L) return
        val channelId = ensureChannel() ?: return
        val launch = playbackLaunchIntent(payload)
        val values = PreviewProgram.Builder()
            .setChannelId(channelId)
            .setType(
                if (payload.itemType == "episode") {
                    PreviewPrograms.TYPE_TV_EPISODE
                } else {
                    PreviewPrograms.TYPE_MOVIE
                },
            )
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
            .setPosterArtAspectRatio(PreviewPrograms.ASPECT_RATIO_MOVIE_POSTER)
            .setIntent(launch)
            .apply {
                payload.posterUrl?.let { setPosterArtUri(Uri.parse(it)) }
            }
            .build()
            .toContentValues()

        try {
            upsert(channelId, contentId, values)
        } catch (error: SecurityException) {
            Log.w(TAG, "Home channel insert blocked", error)
        } catch (error: IllegalArgumentException) {
            Log.w(TAG, "Home channel insert rejected", error)
        }
    }

    fun remove(contentId: String) {
        val knownId = prefs.getLong(KEY_PROGRAM_ID, 0L)
        val knownContent = prefs.getString(KEY_PROGRAM_CONTENT, null)
        if (knownId > 0L && (knownContent == null || knownContent == contentId)) {
            deleteProgram(knownId)
            prefs.edit()
                .remove(KEY_PROGRAM_ID)
                .remove(KEY_PROGRAM_CONTENT)
                .apply()
        }
        val channelId = prefs.getLong(KEY_CHANNEL_ID, 0L)
        if (channelId <= 0L) return
        try {
            resolver.delete(
                TvContractCompat.buildPreviewProgramsUriForChannel(channelId),
                "${PreviewPrograms.COLUMN_INTERNAL_PROVIDER_ID} = ? OR ${PreviewPrograms.COLUMN_CONTENT_ID} = ?",
                arrayOf(contentId, contentId),
            )
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun upsert(channelId: Long, contentId: String, values: android.content.ContentValues) {
        val knownId = prefs.getLong(KEY_PROGRAM_ID, 0L)
        val knownContent = prefs.getString(KEY_PROGRAM_CONTENT, null)
        if (knownId > 0L && knownContent == contentId) {
            val updated = resolver.update(
                TvContractCompat.buildPreviewProgramUri(knownId),
                values,
                null,
                null,
            )
            if (updated > 0) return
        }
        if (knownId > 0L) deleteProgram(knownId)
        try {
            resolver.delete(
                TvContractCompat.buildPreviewProgramsUriForChannel(channelId),
                null,
                null,
            )
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }

        val inserted = resolver.insert(PreviewPrograms.CONTENT_URI, values) ?: return
        rememberProgram(contentId, ContentUris.parseId(inserted))
    }

    private fun ensureChannel(): Long? {
        val knownId = prefs.getLong(KEY_CHANNEL_ID, 0L)
        if (knownId > 0L && channelExists(knownId)) {
            maybeRequestBrowsable(knownId)
            return knownId
        }

        val launch = Intent(context, SetupActivity::class.java).apply {
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val values = Channel.Builder()
            .setType(Channels.TYPE_PREVIEW)
            .setDisplayName(context.getString(R.string.home_channel_name))
            .setDescription(context.getString(R.string.home_channel_description))
            .setAppLinkIntent(launch)
            .setInternalProviderId(CHANNEL_PROVIDER_ID)
            .build()
            .toContentValues()

        val inserted = try {
            resolver.insert(Channels.CONTENT_URI, values)
        } catch (error: SecurityException) {
            Log.w(TAG, "Home channel create blocked", error)
            null
        } catch (error: IllegalArgumentException) {
            Log.w(TAG, "Home channel create rejected", error)
            null
        } ?: return null

        val channelId = ContentUris.parseId(inserted)
        if (channelId <= 0L) return null
        appLogo()?.let { ChannelLogoUtils.storeChannelLogo(context, channelId, it) }
        prefs.edit().putLong(KEY_CHANNEL_ID, channelId).apply()
        maybeRequestBrowsable(channelId)
        Log.i(TAG, "Published Continue watching channel id=$channelId")
        return channelId
    }

    private fun maybeRequestBrowsable(channelId: Long) {
        if (prefs.getBoolean(KEY_BROWSABLE_REQUESTED, false)) return
        try {
            TvContractCompat.requestChannelBrowsable(context, channelId)
            prefs.edit().putBoolean(KEY_BROWSABLE_REQUESTED, true).apply()
        } catch (error: SecurityException) {
            Log.w(TAG, "requestChannelBrowsable blocked", error)
        }
    }

    private fun channelExists(channelId: Long): Boolean {
        return try {
            resolver.query(
                TvContractCompat.buildChannelUri(channelId),
                arrayOf(BaseColumns._ID),
                null,
                null,
                null,
            )?.use { it.moveToFirst() } == true
        } catch (_: SecurityException) {
            true
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    private fun deleteProgram(id: Long) {
        if (id <= 0L) return
        try {
            resolver.delete(TvContractCompat.buildPreviewProgramUri(id), null, null)
        } catch (_: SecurityException) {
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun rememberProgram(contentId: String, id: Long) {
        if (id <= 0L) return
        prefs.edit()
            .putLong(KEY_PROGRAM_ID, id)
            .putString(KEY_PROGRAM_CONTENT, contentId)
            .apply()
    }

    private fun playbackLaunchIntent(payload: PlaybackPayload): Intent {
        val data = Uri.Builder()
            .scheme("media")
            .authority("watch")
            .appendQueryParameter("type", payload.itemType)
            .appendQueryParameter("fileId", payload.fileId.toString())
            .build()
        return Intent(Intent.ACTION_VIEW, data).apply {
            setClass(context, MainActivity::class.java)
            setPackage(context.packageName)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
    }

    private fun appLogo(): Bitmap? {
        val drawable = AppCompatResources.getDrawable(context, R.mipmap.ic_launcher) ?: return null
        val width = drawable.intrinsicWidth.takeIf { it > 0 } ?: 160
        val height = drawable.intrinsicHeight.takeIf { it > 0 } ?: 160
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, width, height)
        drawable.draw(canvas)
        return bitmap
    }

    companion object {
        private const val TAG = "MediaHomeChannel"
        private const val PREFS = "home_channel"
        private const val CHANNEL_PROVIDER_ID = "continue_watching"
        private const val KEY_CHANNEL_ID = "channel_id"
        private const val KEY_PROGRAM_ID = "program_id"
        private const val KEY_PROGRAM_CONTENT = "program_content_id"
        private const val KEY_BROWSABLE_REQUESTED = "browsable_requested"
    }
}
