package com.shengproxy.tts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ShengPipelineTest {

    private val pipeline = ShengPipeline(null)
    private val lexicon = mapOf("jambo" to "JAMBO", "dunia" to "DUNIA")

    @Test
    fun quickLexiconPassPreservesWhitespaceAndPunctuation() {
        val input = "\tJambo,   dunia!\n"

        val result = pipeline.quickLexiconPass(input) { lexicon[it] }

        assertEquals("\tJAMBO,   DUNIA!\n", result)
    }

    @Test
    fun quickLexiconPassFallsBackWhenAWordIsUnknown() {
        assertNull(pipeline.quickLexiconPass("Jambo, stranger!") { lexicon[it] })
    }
}
