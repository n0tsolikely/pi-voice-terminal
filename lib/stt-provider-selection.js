const STT_PROVIDERS = {
  AUTO: 'auto',
  LOCAL: 'local',
  OPENAI: 'openai'
}

function resolveSttProvider({
  requestedProvider = STT_PROVIDERS.AUTO,
  hasOpenAiKey = false,
  hasLocalRuntime = false
}) {
  const provider = normalizeProvider(requestedProvider)

  if (provider === STT_PROVIDERS.OPENAI) {
    if (!hasOpenAiKey) {
      throw new Error('STT_PROVIDER=openai was requested, but OPENAI_API_KEY is missing.')
    }

    return STT_PROVIDERS.OPENAI
  }

  if (provider === STT_PROVIDERS.LOCAL) {
    if (!hasLocalRuntime) {
      throw new Error('STT_PROVIDER=local was requested, but the local Vosk runtime is unavailable.')
    }

    return STT_PROVIDERS.LOCAL
  }

  if (hasLocalRuntime) {
    return STT_PROVIDERS.LOCAL
  }

  if (hasOpenAiKey) {
    return STT_PROVIDERS.OPENAI
  }

  throw new Error('No STT provider is available. Install the local Vosk runtime or configure OPENAI_API_KEY.')
}

function providerSupportsLiveStt(provider) {
  return normalizeProvider(provider) === STT_PROVIDERS.LOCAL
}

function normalizeProvider(value) {
  const normalized = String(value || STT_PROVIDERS.AUTO).trim().toLowerCase()

  if (Object.values(STT_PROVIDERS).includes(normalized)) {
    return normalized
  }

  return STT_PROVIDERS.AUTO
}

module.exports = {
  STT_PROVIDERS,
  providerSupportsLiveStt,
  resolveSttProvider
}
