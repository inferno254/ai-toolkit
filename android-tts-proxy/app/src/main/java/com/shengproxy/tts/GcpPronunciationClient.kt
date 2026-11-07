package com.shengproxy.tts

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class GcpPronunciationClient : UnknownWordPronouncer {
    companion object {
        private const val TAG = "GcpPronunciation"
        private const val API_KEY = "" // Add your Gemini API key here
        private const val GCP_ENDPOINT = "https://us-central1-aiplatform.googleapis.com/v1/projects/627966196490/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent"

        private val client = OkHttpClient.Builder()
            .connectTimeout(500, TimeUnit.MILLISECONDS)
            .readTimeout(1000, TimeUnit.MILLISECONDS)
            .writeTimeout(1000, TimeUnit.MILLISECONDS)
            .build()

        private val mediaType = "application/json; charset=utf-8".toMediaType()
    }

    private suspend fun buildPrompt(words: List<String>, context: String): String {
        val wordStr = words.joinToString(", ") { "\"$it\"" }
        val contextSection = if (context.isNotEmpty()) "\nContext: $context" else ""
        return """
            You are a phonetic assistant for Kenyan Sheng. Given the words: $wordStr$contextSection
            Return ONLY a JSON object mapping each word to its phonetic spelling for TTS.
            Format: {"word1": "phonetic1", "word2": "phonetic2"}
            No explanations, no additional text.
        """.trimIndent()
    }

    private suspend fun parseResponse(body: String, words: List<String>): Map<String, PronunciationHint> {
        return try {
            val json = org.json.JSONObject(body)
            val candidates = json.optJSONArray("candidates") ?: return emptyMap()
            if (candidates.length() == 0) return emptyMap()
            
            val content = candidates.getJSONObject(0).optJSONObject("content") ?: return emptyMap()
            val parts = content.optJSONArray("parts") ?: return emptyMap()
            if (parts.length() == 0) return emptyMap()
            
            val responseText = parts.getJSONObject(0).optString("text", "").trim()
            if (responseText.isEmpty()) return emptyMap()
            
            val resultJson = org.json.JSONObject(responseText)
            val result = mutableMapOf<String, PronunciationHint>()
            val keys = resultJson.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = resultJson.optString(key, "")
                if (value.isNotEmpty() && key in words) {
                    result[key.lowercase()] = PronunciationHint(value, SpeechLanguage.ENGLISH)
                }
            }
            result
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse response", e)
            emptyMap()
        }
    }

    override suspend fun pronounce(words: List<String>, context: String): Map<String, PronunciationHint> = withContext(Dispatchers.IO) {
        try {
            val prompt = buildPrompt(words, context)
            val json = """{"contents":[{"role":"user","parts":[{"text":"$prompt"}]}]}"""

            val request = Request.Builder()
                .url("$GCP_ENDPOINT?key=$API_KEY")
                .post(json.toRequestBody(mediaType))
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "API call failed: ${response.code}")
                    return@withContext emptyMap()
                }
                val body = response.body?.string() ?: return@withContext emptyMap()
                parseResponse(body, words)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Online pronunciation failed, returning original words", e)
            emptyMap()
        }
    }
}