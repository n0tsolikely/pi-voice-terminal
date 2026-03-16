const test = require('node:test')
const assert = require('node:assert/strict')

const { TtsService } = require('../lib/tts-service')
const { TTS_PROVIDERS } = require('../lib/tts-provider-selection')

test('uses OpenAI TTS when requested provider resolves to openai', async () => {
  const service = new TtsService({
    requestedProvider: TTS_PROVIDERS.AUTO,
    openAiAudioClient: {
      hasApiKey: () => true,
      synthesizeSpeech: async () => Buffer.from('mp3')
    },
    piperTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('wav')
    },
    espeakTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('espeak')
    }
  })

  const result = await service.synthesizeSpeech('hello')

  assert.equal(result.provider, TTS_PROVIDERS.OPENAI)
  assert.equal(result.mimeType, 'audio/mpeg')
  assert.equal(result.audioBuffer.toString(), 'mp3')
})

test('falls back to Piper when no OpenAI key exists', async () => {
  const service = new TtsService({
    requestedProvider: TTS_PROVIDERS.AUTO,
    openAiAudioClient: {
      hasApiKey: () => false,
      synthesizeSpeech: async () => Buffer.from('mp3')
    },
    piperTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('wav')
    },
    espeakTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('espeak')
    }
  })

  const result = await service.synthesizeSpeech('hello')

  assert.equal(result.provider, TTS_PROVIDERS.PIPER)
  assert.equal(result.mimeType, 'audio/wav')
  assert.equal(result.audioBuffer.toString(), 'wav')
})

test('falls back to Piper on OpenAI network failure when provider is auto', async () => {
  const service = new TtsService({
    requestedProvider: TTS_PROVIDERS.AUTO,
    openAiAudioClient: {
      hasApiKey: () => true,
      synthesizeSpeech: async () => {
        throw new Error('fetch failed')
      }
    },
    piperTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('wav')
    },
    espeakTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('espeak')
    }
  })

  const result = await service.synthesizeSpeech('hello')

  assert.equal(result.provider, TTS_PROVIDERS.PIPER)
  assert.equal(result.fallbackFrom, TTS_PROVIDERS.OPENAI)
  assert.equal(result.mimeType, 'audio/wav')
  assert.equal(result.audioBuffer.toString(), 'wav')
})

test('falls back to Piper on OpenAI auth failure when provider is auto', async () => {
  const service = new TtsService({
    requestedProvider: TTS_PROVIDERS.AUTO,
    openAiAudioClient: {
      hasApiKey: () => true,
      synthesizeSpeech: async () => {
        const error = new Error('TTS request failed with 401: Incorrect API key provided.')

        error.status = 401
        error.isAuthError = true
        throw error
      }
    },
    piperTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('wav')
    },
    espeakTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('espeak')
    }
  })

  const result = await service.synthesizeSpeech('hello')

  assert.equal(result.provider, TTS_PROVIDERS.PIPER)
  assert.equal(result.fallbackFrom, TTS_PROVIDERS.OPENAI)
  assert.equal(result.mimeType, 'audio/wav')
  assert.equal(result.audioBuffer.toString(), 'wav')
})

test('falls back to espeak-ng when Piper is unavailable', async () => {
  const service = new TtsService({
    requestedProvider: TTS_PROVIDERS.AUTO,
    openAiAudioClient: {
      hasApiKey: () => false,
      synthesizeSpeech: async () => Buffer.from('mp3')
    },
    piperTtsClient: {
      isAvailable: () => false,
      synthesizeSpeech: async () => Buffer.from('wav')
    },
    espeakTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('espeak')
    }
  })

  const result = await service.synthesizeSpeech('hello')

  assert.equal(result.provider, TTS_PROVIDERS.ESPEAK)
  assert.equal(result.mimeType, 'audio/wav')
  assert.equal(result.audioBuffer.toString(), 'espeak')
})

test('falls back from Piper to espeak-ng when the primary local engine is missing', async () => {
  const service = new TtsService({
    requestedProvider: TTS_PROVIDERS.LOCAL,
    openAiAudioClient: {
      hasApiKey: () => false,
      synthesizeSpeech: async () => Buffer.from('mp3')
    },
    piperTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => {
        throw new Error('spawn piper ENOENT')
      }
    },
    espeakTtsClient: {
      isAvailable: () => true,
      synthesizeSpeech: async () => Buffer.from('espeak')
    }
  })

  const result = await service.synthesizeSpeech('hello')

  assert.equal(result.provider, TTS_PROVIDERS.ESPEAK)
  assert.equal(result.fallbackFrom, TTS_PROVIDERS.PIPER)
  assert.equal(result.audioBuffer.toString(), 'espeak')
})
