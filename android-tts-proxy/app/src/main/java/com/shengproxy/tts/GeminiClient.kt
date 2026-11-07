package com.shengproxy.tts

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * GeminiClient: Optimized for zero-crash tolerance.
 * - 1000ms timeout (down from 1500ms for faster failover)
 * - Instant exception catch returns original text
 * - No blocking on TTS thread
 */
class GeminiClient(private val apiKey: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(500, TimeUnit.MILLISECONDS)
        .readTimeout(500, TimeUnit.MILLISECONDS)
        .writeTimeout(500, TimeUnit.MILLISECONDS)
        .callTimeout(1000, TimeUnit.MILLISECONDS)
        .build()

    private val mediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun getPhoneticFallback(text: String): String = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) return@withContext text
        try {
            val url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$apiKey"
            val prompt = """Return ONLY phonetic spelling. No explanations.

Text: $text"""

            val content = JSONObject().apply {
                put("contents", JSONArray().apply {
                    put(JSONObject().apply {
                        put("parts", JSONArray().apply {
                            put(JSONObject().apply { put("text", prompt) })
                        })
                    })
                })
            }

            val body = content.toString().toRequestBody(mediaType)
            val request = Request.Builder()
                .url(url)
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext text
                val responseBody = response.body?.string() ?: return@withContext text
                val json = JSONObject(responseBody)
                val candidates = json.optJSONArray("candidates") ?: return@withContext text
                if (candidates.length() == 0) return@withContext text
                val contentObj = candidates.getJSONObject(0).optJSONObject("content") ?: return@withContext text
                val parts = contentObj.optJSONArray("parts") ?: return@withContext text
                if (parts.length() == 0) return@withContext text
                val result = parts.getJSONObject(0).optString("text", text).trim()
                return@withContext if (result.isNotBlank()) result else text
            }
        } catch (e: Exception) {
            // Instant failover - return original text, never block
            return@withContext text
        }
    }
}
