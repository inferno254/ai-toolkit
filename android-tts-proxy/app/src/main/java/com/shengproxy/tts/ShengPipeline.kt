package com.shengproxy.tts

import kotlinx.coroutines.coroutineScope

/**
 * ShengPipeline: Optimized for short conversational bursts.
 * - Fast lexicon path (95%+ of short messages)
 * - Gemini only for unknown slang
 * - Minimal allocation for short strings
 */
class ShengPipeline(private val geminiClient: GeminiClient?) {

    private val slangRegex = Regex("[a-zA-Z]+[0-9]+|[0-9]+[a-zA-Z]+")

    suspend fun processText(input: String): String = coroutineScope {
        // Fast path: if input is short and all words are in lexicon, skip complex processing
        if (input.length < 100) {
            val quickResult = quickLexiconPass(input)
            if (quickResult != null) return@coroutineScope quickResult
        }

        val tokens = tokenize(input)
        val result = StringBuilder(input.length + 20)

        for (token in tokens) {
            val trimmed = token.trim()
            if (trimmed.isEmpty() || trimmed.all { it.isWhitespace() || !it.isLetterOrDigit() }) {
                result.append(token)
                continue
            }

            val lexiconResult = LexiconManager.lookup(trimmed)
            if (lexiconResult != null) {
                result.append(lexiconResult)
                continue
            }

            val isSlang = slangRegex.containsMatchIn(trimmed) ||
                    (trimmed.length <= 4 && trimmed.any { it.isLetter() }) ||
                    trimmed.contains("'") || trimmed.contains("-")

            if (isSlang && geminiClient != null) {
                try {
                    val fallback = geminiClient.getPhoneticFallback(trimmed)
                    result.append(fallback)
                } catch (e: Exception) {
                    result.append(trimmed)
                }
            } else {
                result.append(trimmed)
            }
        }

        return@coroutineScope result.toString()
    }

    internal fun quickLexiconPass(
        input: String,
        lookup: (String) -> String? = LexiconManager::lookup
    ): String? {
        val words = Regex("[\\p{L}\\p{N}]+").findAll(input)
        val result = StringBuilder()
        var cursor = 0
        for (word in words) {
            result.append(input, cursor, word.range.first)
            val replacement = lookup(word.value.lowercase()) ?: return null
            result.append(replacement)
            cursor = word.range.last + 1
        }
        if (cursor == 0) return null
        result.append(input, cursor, input.length)
        return result.toString()
    }

    private fun tokenize(input: String): List<String> {
        val tokens = mutableListOf<String>()
        val regex = Regex("(\\s+|[^\\w\\s]+)")
        val parts = input.split(regex)
        val delimiters = regex.findAll(input).map { it.value }.toList()

        var d = 0
        for (part in parts) {
            if (part.isNotEmpty()) tokens.add(part)
            if (d < delimiters.size) {
                tokens.add(delimiters[d])
                d++
            }
        }
        while (tokens.isNotEmpty() && tokens.last().isEmpty()) tokens.removeAt(tokens.size - 1)
        return tokens
    }
}
