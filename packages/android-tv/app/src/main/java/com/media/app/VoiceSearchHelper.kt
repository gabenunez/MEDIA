package com.media.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

class VoiceSearchHelper(
    private val context: Context,
    private val onResult: (String) -> Unit,
    private val onError: (() -> Unit)? = null,
) {
    private var speechRecognizer: SpeechRecognizer? = null

    fun start() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onError?.invoke()
            return
        }

        release()
        speechRecognizer =
            SpeechRecognizer.createSpeechRecognizer(context).apply {
                setRecognitionListener(
                    object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) = Unit

                        override fun onBeginningOfSpeech() = Unit

                        override fun onRmsChanged(rmsdB: Float) = Unit

                        override fun onBufferReceived(buffer: ByteArray?) = Unit

                        override fun onEndOfSpeech() = Unit

                        override fun onError(error: Int) {
                            onError?.invoke()
                            release()
                        }

                        override fun onResults(results: Bundle?) {
                            val matches =
                                results
                                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                    ?.firstOrNull()
                                    ?.trim()
                            release()
                            if (!matches.isNullOrBlank()) {
                                onResult(matches)
                            } else {
                                onError?.invoke()
                            }
                        }

                        override fun onPartialResults(partialResults: Bundle?) = Unit

                        override fun onEvent(eventType: Int, params: Bundle?) = Unit
                    },
                )
            }

        val intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                )
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }

        speechRecognizer?.startListening(intent)
    }

    fun release() {
        speechRecognizer?.destroy()
        speechRecognizer = null
    }
}
