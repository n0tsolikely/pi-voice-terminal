const test = require('node:test')
const assert = require('node:assert/strict')

const {
  TTS_PROVIDERS,
  resolveTtsProvider,
  resolveTtsProviderOrder
} = require('../lib/tts-provider-selection')

test('auto prefers OpenAI when an API key is available', () => {
  assert.equal(
    resolveTtsProvider({
      requestedProvider: TTS_PROVIDERS.AUTO,
      hasOpenAiKey: true,
      hasPiper: true,
      hasEspeak: true
    }),
    TTS_PROVIDERS.OPENAI
  )
})

test('auto falls back to Piper when no API key is available', () => {
  assert.equal(
    resolveTtsProvider({
      requestedProvider: TTS_PROVIDERS.AUTO,
      hasOpenAiKey: false,
      hasPiper: true,
      hasEspeak: true
    }),
    TTS_PROVIDERS.PIPER
  )
})

test('local provider order prefers Piper before espeak-ng', () => {
  assert.deepEqual(
    resolveTtsProviderOrder({
      requestedProvider: TTS_PROVIDERS.LOCAL,
      hasOpenAiKey: true,
      hasPiper: true,
      hasEspeak: true
    }),
    [TTS_PROVIDERS.PIPER, TTS_PROVIDERS.ESPEAK]
  )
})

test('explicit local fails clearly when unavailable', () => {
  assert.throws(
    () =>
      resolveTtsProvider({
        requestedProvider: TTS_PROVIDERS.LOCAL,
        hasOpenAiKey: true,
        hasPiper: false,
        hasEspeak: false
      }),
    /local Linux TTS provider is available/
  )
})

test('explicit openai fails clearly when no key exists', () => {
  assert.throws(
    () =>
      resolveTtsProvider({
        requestedProvider: TTS_PROVIDERS.OPENAI,
        hasOpenAiKey: false,
        hasPiper: true,
        hasEspeak: true
      }),
    /OPENAI_API_KEY is missing/
  )
})

test('explicit espeak fails clearly when espeak-ng is unavailable', () => {
  assert.throws(
    () =>
      resolveTtsProvider({
        requestedProvider: TTS_PROVIDERS.ESPEAK,
        hasOpenAiKey: true,
        hasPiper: true,
        hasEspeak: false
      }),
    /espeak-ng is unavailable/
  )
})
