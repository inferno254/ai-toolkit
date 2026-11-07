package com.shengproxy.tts

import android.content.Context
import android.util.Base64
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

data class PronunciationHint(
    val phonetic: String,
    val language: SpeechLanguage
)

class FirebasePronunciationClient private constructor(
    private val app: FirebaseApp,
    private val appContext: Context
) : UnknownWordPronouncer {
    override suspend fun pronounce(
        words: List<String>,
        phraseContext: String
    ): Map<String, PronunciationHint> = withTimeout(ONLINE_CALL_TIMEOUT_MS) {
        if (!OnlineAssistSettings.isEnabled(appContext)) return@withTimeout emptyMap()
        require(words.isNotEmpty() && words.size <= MAX_WORDS)
        require(phraseContext.length <= MAX_CONTEXT_LENGTH)

        val auth = FirebaseAuth.getInstance(app)
        if (auth.currentUser == null) {
            auth.signInAnonymously().await()
        }

        val result = FirebaseFunctions.getInstance(app, REGION)
            .getHttpsCallable(FUNCTION_NAME)
            .withTimeout(FUNCTION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .call(mapOf("words" to words, "context" to phraseContext))
            .await()
        val response = result.getData() as? Map<*, *>
            ?: error("Pronunciation response was not an object")
        val entries = response["pronunciations"] as? List<*>
            ?: error("Pronunciation response did not contain results")
        check(entries.size == words.size) { "Pronunciation response size did not match request" }

        val requestedWords = words.associateBy { it.lowercase() }
        val hints = mutableMapOf<String, PronunciationHint>()
        entries.forEach { entry ->
            val item = entry as? Map<*, *> ?: error("Invalid pronunciation entry")
            val word = item["word"] as? String ?: error("Pronunciation word is missing")
            val phonetic = item["phonetic"] as? String ?: error("Phonetic spelling is missing")
            val language = when (item["language"] as? String) {
                "en" -> SpeechLanguage.ENGLISH
                "sw" -> SpeechLanguage.SWAHILI
                else -> error("Unsupported pronunciation language")
            }
            val requested = requestedWords[word.lowercase()]
                ?: error("Backend returned an unrequested word")
            check(phonetic.matches(PHONETIC_PATTERN)) { "Invalid phonetic spelling" }
            check(hints.put(requested.lowercase(), PronunciationHint(phonetic, language)) == null) {
                "Backend returned a duplicate word"
            }
        }
        check(hints.size == words.size) { "Backend omitted a requested word" }
        hints
    }

    suspend fun recognizeImage(jpeg: ByteArray): String = withTimeout(ONLINE_OCR_TIMEOUT_MS) {
        if (!OnlineOcrSettings.isEnabled(appContext)) return@withTimeout ""
        require(jpeg.isNotEmpty() && jpeg.size <= MAX_OCR_IMAGE_BYTES)

        val auth = FirebaseAuth.getInstance(app)
        if (auth.currentUser == null) {
            auth.signInAnonymously().await()
        }

        val result = FirebaseFunctions.getInstance(app, REGION)
            .getHttpsCallable(OCR_FUNCTION_NAME)
            .withTimeout(OCR_FUNCTION_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .call(
                mapOf(
                    "mimeType" to "image/jpeg",
                    "image" to Base64.encodeToString(jpeg, Base64.NO_WRAP)
                )
            )
            .await()
        val response = result.getData() as? Map<*, *>
            ?: error("OCR response was not an object")
        val text = response["text"] as? String
            ?: error("OCR response did not contain text")
        check(text.length <= MAX_OCR_TEXT_LENGTH) { "OCR response was too long" }
        check(!text.any { it.code < 0x20 && it != '\n' && it != '\t' }) {
            "OCR response contained invalid characters"
        }
        text.trim()
    }

    companion object {
        private const val TAG = "FirebasePronunciation"
        private const val REGION = "europe-west1"
        private const val FUNCTION_NAME = "adaptUnknownShengWords"
        private const val OCR_FUNCTION_NAME = "readFocusedImageText"
        private const val MAX_WORDS = 20
        private const val MAX_CONTEXT_LENGTH = 280
        private const val MAX_OCR_IMAGE_BYTES = 1_500_000
        private const val MAX_OCR_TEXT_LENGTH = 6000
        private const val ONLINE_CALL_TIMEOUT_MS = 7_000L
        private const val ONLINE_OCR_TIMEOUT_MS = 12_000L
        private const val FUNCTION_TIMEOUT_SECONDS = 6L
        private const val OCR_FUNCTION_TIMEOUT_SECONDS = 11L
        private val PHONETIC_PATTERN = Regex("[\\p{L}\\p{M}'’-]{1,60}")
        @Volatile
        private var cachedClient: FirebasePronunciationClient? = null

        fun createIfConfigured(context: Context): FirebasePronunciationClient? {
            cachedClient?.let { return it }
            synchronized(this) {
                cachedClient?.let { return it }
                val app = FirebaseApp.getApps(context).firstOrNull()
                    ?: FirebaseApp.initializeApp(context)
                    ?: return null
                FirebaseAppCheck.getInstance(app).installAppCheckProviderFactory(
                    AppCheckInstaller.providerFactory()
                )
                Log.i(TAG, "Firebase pronunciation client configured")
                return FirebasePronunciationClient(app, context.applicationContext).also {
                    cachedClient = it
                }
            }
        }
    }
}

interface UnknownWordPronouncer {
    suspend fun pronounce(words: List<String>, phraseContext: String): Map<String, PronunciationHint>
}

object OnlineAssistSettings {
    private const val PREFERENCES = "sheng_online_assist"
    private const val ENABLED = "enabled"

    fun isEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(ENABLED, enabled)
            .apply()
    }
}

object OnlineOcrSettings {
    private const val PREFERENCES = "sheng_online_ocr"
    private const val ENABLED = "enabled"

    fun isEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(ENABLED, enabled)
            .apply()
    }
}
