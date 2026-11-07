package com.shengproxy.tts

import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

internal object AppCheckInstaller {
    fun providerFactory(): AppCheckProviderFactory =
        DebugAppCheckProviderFactory.getInstance()
}
