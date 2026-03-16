const test = require('node:test')
const assert = require('node:assert/strict')

const {
  STT_PROVIDERS,
  providerSupportsLiveStt,
  resolveSttProvider
} = require('../lib/stt-provider-selection')

test('auto prefers the local Vosk runtime when available', () => {
  assert.equal(
    resolveSttProvider({
      requestedProvider: STT_PROVIDERS.AUTO,
      hasOpenAiKey: true,
      hasLocalRuntime: true
    }),
    STT_PROVIDERS.LOCAL
  )
})

test('auto falls back to OpenAI when the local runtime is unavailable', () => {
  assert.equal(
    resolveSttProvider({
      requestedProvider: STT_PROVIDERS.AUTO,
      hasOpenAiKey: true,
      hasLocalRuntime: false
    }),
    STT_PROVIDERS.OPENAI
  )
})

test('explicit local fails clearly when Vosk is unavailable', () => {
  assert.throws(
    () =>
      resolveSttProvider({
        requestedProvider: STT_PROVIDERS.LOCAL,
        hasOpenAiKey: false,
        hasLocalRuntime: false
      }),
    /local Vosk runtime is unavailable/
  )
})

test('only the local provider supports live STT', () => {
  assert.equal(providerSupportsLiveStt(STT_PROVIDERS.LOCAL), true)
  assert.equal(providerSupportsLiveStt(STT_PROVIDERS.OPENAI), false)
})
