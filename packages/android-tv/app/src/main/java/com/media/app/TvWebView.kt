package com.media.app

import android.content.Context
import android.os.Build
import android.util.AttributeSet
import android.view.KeyEvent
import android.webkit.WebView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.annotation.RequiresApi

class TvWebView(context: Context, attrs: AttributeSet) : WebView(context, attrs) {
    var searchEditing = false
        set(editing) {
            if (field == editing) return
            field = editing
            if (Build.VERSION.SDK_INT >= 33) {
                searchBack?.unregister()
                searchBack = if (editing) findOnBackInvokedDispatcher()?.let { dispatcher ->
                    SearchBackCallback(dispatcher, ::closeSearchEditor)
                } else null
            }
        }
    private var trackingSearchBack = false
    private var searchBack: SearchBackCallback? = null

    private fun closeSearchEditor() {
        if (searchEditing) evaluateJavascript("window.__mediaSearchHandleBack?.()", null)
    }

    override fun onKeyPreIme(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                trackingSearchBack = searchEditing
            }
            if (trackingSearchBack) {
                if (event.action == KeyEvent.ACTION_UP) {
                    trackingSearchBack = false
                    if (!event.isCanceled) closeSearchEditor()
                }
                return true
            }
        }
        return super.onKeyPreIme(keyCode, event)
    }

    override fun onDetachedFromWindow() {
        searchEditing = false
        super.onDetachedFromWindow()
    }

    @RequiresApi(33)
    private class SearchBackCallback(
        private val dispatcher: OnBackInvokedDispatcher,
        closeEditor: () -> Unit,
    ) {
        private val callback = OnBackInvokedCallback { closeEditor() }

        init {
            // While the editor is open, Back should dismiss it along with the keyboard.
            dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, callback)
        }

        fun unregister() = dispatcher.unregisterOnBackInvokedCallback(callback)
    }
}
