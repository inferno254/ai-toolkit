package com.shengproxy.tts

import android.content.Context
import android.util.Log
import com.google.gson.JsonParser
import java.io.BufferedReader
import java.io.InputStreamReader

data class LexiconPronunciation(
    val term: String,
    val english: String,
    val swahili: String,
    val tags: Set<String>
)

data class LexiconPrefix(val prefix: String, val phonetic: String)

data class ShengLexicon(
    val entries: Map<String, LexiconPronunciation>,
    val prefixes: List<LexiconPrefix>
)

object LexiconManager {
    private const val TAG = "LexiconManager"
    private var lexicon = ShengLexicon(emptyMap(), emptyList())
    private var initialized = false

    @Synchronized
    fun initialize(context: Context) {
        if (initialized) return
        try {
            val json = context.assets.open("sheng-lexicon.json").use { inputStream ->
                BufferedReader(InputStreamReader(inputStream), 8192).use { it.readText() }
            }
            lexicon = parse(json)
            check(lexicon.entries.isNotEmpty()) { "The Sheng lexicon has no entries" }
            initialized = true
            Log.i(TAG, "Loaded ${lexicon.entries.size} phonetic entries")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load sheng-lexicon.json", e)
            throw IllegalStateException("Failed to initialize Sheng lexicon", e)
        }
    }

    internal fun parse(json: String): ShengLexicon {
        val root = JsonParser.parseString(json).asJsonObject
        val entriesJson = root.getAsJsonArray("lexicon")
        val entries = LinkedHashMap<String, LexiconPronunciation>(entriesJson.size())
        for (entryElement in entriesJson) {
            val entry = entryElement.asJsonObject
            val term = entry.get("term").asString.trim().lowercase()
            require(term.isNotEmpty()) { "Lexicon entry has an empty term" }
            val tagsJson = entry.getAsJsonArray("tags")
            val tags = buildSet {
                if (tagsJson != null) {
                    for (tag in tagsJson) add(tag.asString.lowercase())
                }
            }
            entries[term] = LexiconPronunciation(
                term = term,
                english = entry.get("phoneticEn")?.asString ?: term,
                swahili = entry.get("phoneticSw")?.asString ?: term,
                tags = tags
            )
        }

        val prefixesJson = root.getAsJsonArray("prefixes")
        val prefixes = buildList {
            if (prefixesJson != null) {
                for (prefixElement in prefixesJson) {
                    val prefix = prefixElement.asJsonObject
                    add(
                        LexiconPrefix(
                            prefix.get("prefix").asString.lowercase(),
                            prefix.get("phonetic").asString
                        )
                    )
                }
            }
        }.sortedByDescending { it.prefix.length }

        return ShengLexicon(entries, prefixes)
    }

    fun lookup(word: String): LexiconPronunciation? {
        return resolve(word, lexicon)
    }

    internal fun resolve(word: String, data: ShengLexicon): LexiconPronunciation? {
        val lower = word.lowercase()
        data.entries[lower]?.let { return it }

        for (prefix in data.prefixes) {
            if (lower.startsWith(prefix.prefix) && lower.length > prefix.prefix.length + 2) {
                data.entries[lower.substring(prefix.prefix.length)]?.let { root ->
                    val separator = if (prefix.phonetic.endsWith(" ") || prefix.phonetic.endsWith("-")) {
                        ""
                    } else {
                        "-"
                    }
                    return root.copy(
                        term = lower,
                        english = prefix.phonetic + separator + root.english,
                        swahili = lower
                    )
                }
            }
        }
        return null
    }

    fun isInitialized(): Boolean = initialized
}
