const { TTS_PROVIDERS, resolveTtsProviderOrder } = require('./tts-provider-selection')

class TtsService {
  constructor({ requestedProvider, openAiAudioClient, piperTtsClient, espeakTtsClient }) {
    this.requestedProvider = requestedProvider
    this.openAiAudioClient = openAiAudioClient
    this.piperTtsClient = piperTtsClient
    this.espeakTtsClient = espeakTtsClient
  }

  async synthesizeSpeech(text) {
    const providerOrder = resolveTtsProviderOrder({
      requestedProvider: this.requestedProvider,
      hasOpenAiKey: this.openAiAudioClient.hasApiKey(),
      hasPiper: this.piperTtsClient.isAvailable(),
      hasEspeak: this.espeakTtsClient.isAvailable()
    })
    const primaryProvider = providerOrder[0]

    for (let index = 0; index < providerOrder.length; index += 1) {
      const provider = providerOrder[index]

      try {
        const audioPayload = await this.synthesizeWithProvider(provider, text)

        if (!audioPayload?.audioBuffer) {
          return null
        }

        if (index > 0) {
          audioPayload.fallbackFrom = primaryProvider
        }

        return audioPayload
      } catch (error) {
        if (index === providerOrder.length - 1 || !shouldFallbackToNextProvider(error)) {
          throw error
        }
      }
    }

    return null
  }

  async synthesizeWithProvider(provider, text) {
    if (provider === TTS_PROVIDERS.OPENAI) {
      const audioBuffer = await this.openAiAudioClient.synthesizeSpeech(text)

      return audioBuffer
        ? {
            audioBuffer,
            mimeType: 'audio/mpeg',
            provider
          }
        : null
    }

    if (provider === TTS_PROVIDERS.PIPER) {
      const audioBuffer = await this.piperTtsClient.synthesizeSpeech(text)

      return audioBuffer
        ? {
            audioBuffer,
            mimeType: 'audio/wav',
            provider
          }
        : null
    }

    const audioBuffer = await this.espeakTtsClient.synthesizeSpeech(text)

    return audioBuffer
      ? {
          audioBuffer,
          mimeType: 'audio/wav',
          provider
        }
      : null
  }
}

function shouldFallbackToNextProvider(error) {
  const message = error instanceof Error ? error.message : String(error)

  return /(?:failed to fetch|fetch failed|network|socket|timed out|timeout|econn|enoent|enotfound|not found|offline|502|503|504|401|incorrect api key|invalid api key|invalid_api_key|unauthorized|authentication|unavailable|not configured|missing)/i.test(
    message
  )
}

module.exports = {
  TtsService
}
