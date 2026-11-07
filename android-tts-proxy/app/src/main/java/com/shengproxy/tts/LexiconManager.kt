package com.shengproxy.tts

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * LexiconManager: Singleton that loads sheng-lexicon.json from assets.
 * O(1) lookup with morphological prefix stripping for Swahili prefixes.
 */
object LexiconManager {
    private const val TAG = "LexiconManager"
    private val lexicon = HashMap<String, String>(1024)
    private val swahiliPrefixes = arrayOf("ku", "wana", "vi", "m", "wa", "tu", "u", "ni", "li", "ya", "ma", "ki")
    private var initialized = false

    fun initialize(context: Context) {
        if (initialized) return
        try {
            val json = context.assets.open("sheng-lexicon.json").use { inputStream ->
                BufferedReader(InputStreamReader(inputStream), 8192).use { reader ->
                    reader.readText()
                }
            }
            val obj = JSONObject(json)
            val loadedLexicon = HashMap<String, String>(obj.length())
            val keys = obj.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                loadedLexicon[key.lowercase()] = obj.getString(key)
            }
            lexicon.putAll(loadedLexicon)
            initialized = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load sheng-lexicon.json", e)
            throw IllegalStateException("Failed to initialize Sheng lexicon", e)
        }
    }

    fun lookup(word: String): String? {
        val lower = word.lowercase()
        // Direct O(1) lookup
        lexicon[lower]?.let { return it }

        // Morphological prefix stripping
        for (prefix in swahiliPrefixes) {
            if (lower.startsWith(prefix) && lower.length > prefix.length + 1) {
                val root = lower.substring(prefix.length)
                lexicon[root]?.let { return "$prefix$it" }
            }
        }
        return null
    }

    fun isInitialized(): Boolean = initialized
}
