package com.shengproxy.tts

import org.junit.Assert.assertEquals
import org.junit.Test

class ShengPipelineTest {

    private val pipeline = ShengPipeline()
    @Test
    fun pipelinePreservesWhitespaceAndPunctuation() {
        val entries = mapOf(
            "jambo" to LexiconPronunciation("jambo", "JAMBO", "jambo", emptySet()),
            "dunia" to LexiconPronunciation("dunia", "DUNIA", "dunia", emptySet())
        )
        val segments = pipeline.processSegments("\tJambo,   dunia!\n") { entries[it] }

        assertEquals("\tJAMBO,   DUNIA!\n", segments.joinToString("") { it.text })
    }

    @Test
    fun pipelineSeparatesSwahiliShengAndEnglish() {
        val entries = mapOf(
            "mathree" to LexiconPronunciation(
                "mathree", "maa-three", "mathree", setOf("noun", "transport")
            )
        )

        val segments = pipeline.processSegments(
            "Leo tuko kwa stage ya mathree, I'm home."
        ) { entries[it] }

        assertEquals(
            listOf(
                SpeechSegment("Leo tuko kwa", SpeechLanguage.SWAHILI),
                SpeechSegment(" stage", SpeechLanguage.ENGLISH),
                SpeechSegment(" ya", SpeechLanguage.SWAHILI),
                SpeechSegment(" maa-three, I'm home.", SpeechLanguage.ENGLISH)
            ),
            segments
        )
    }

    @Test
    fun lexiconParserReadsCoreEntryAndPrefixArrays() {
        val parsed = LexiconManager.parse(
            """{"lexicon":[{"term":"mathree","phoneticEn":"maa-three","phoneticSw":"mathree","tags":["transport"]},{"term":"dhokoma","phoneticEn":"dho-koma","phoneticSw":"dhokoma"}],"prefixes":[{"prefix":"ku","phonetic":"koo " }]}"""
        )

        assertEquals("maa-three", parsed.entries["mathree"]?.english)
        assertEquals("mathree", parsed.entries["mathree"]?.swahili)
        assertEquals("transport", parsed.entries["mathree"]?.tags?.single())
        assertEquals(LexiconPrefix("ku", "koo "), parsed.prefixes.single())
        assertEquals(
            "koo dho-koma",
            LexiconManager.resolve("kudhokoma", parsed)?.english
        )
    }
}
