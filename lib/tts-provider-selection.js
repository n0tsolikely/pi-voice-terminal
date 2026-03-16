const TTS_PROVIDERS = {
  AUTO: 'auto',
  LOCAL: 'local',
  OPENAI: 'openai',
  PIPER: 'piper',
  ESPEAK: 'espeak'
}

function resolveTtsProvider(options) {
  return resolveTtsProviderOrder(options)[0]
}

function resolveTtsProviderOrder({
  requestedProvider = TTS_PROVIDERS.AUTO,
  hasOpenAiKey = false,
  hasPiper = false,
  hasEspeak = false
}) {
  const provider = normalizeProvider(requestedProvider)

  if (provider === TTS_PROVIDERS.OPENAI) {
    if (!hasOpenAiKey) {
      throw new Error('TTS_PROVIDER=openai was requested, but OPENAI_API_KEY is missing.')
    }

    return [TTS_PROVIDERS.OPENAI]
  }

  if (provider === TTS_PROVIDERS.PIPER) {
    if (!hasPiper) {
      throw new Error('TTS_PROVIDER=piper was requested, but Piper TTS is unavailable.')
    }

    return [TTS_PROVIDERS.PIPER]
  }

  if (provider === TTS_PROVIDERS.ESPEAK) {
    if (!hasEspeak) {
      throw new Error('TTS_PROVIDER=espeak was requested, but espeak-ng is unavailable.')
    }

    return [TTS_PROVIDERS.ESPEAK]
  }

  if (provider === TTS_PROVIDERS.LOCAL) {
    const localProviders = []

    if (hasPiper) {
      localProviders.push(TTS_PROVIDERS.PIPER)
    }

    if (hasEspeak) {
      localProviders.push(TTS_PROVIDERS.ESPEAK)
    }

    if (!localProviders.length) {
      throw new Error('TTS_PROVIDER=local was requested, but no local Linux TTS provider is available.')
    }

    return localProviders
  }

  const autoProviders = []

  if (hasOpenAiKey) {
    autoProviders.push(TTS_PROVIDERS.OPENAI)
  }

  if (hasPiper) {
    autoProviders.push(TTS_PROVIDERS.PIPER)
  }

  if (hasEspeak) {
    autoProviders.push(TTS_PROVIDERS.ESPEAK)
  }

  if (!autoProviders.length) {
    throw new Error('No TTS provider is available. Configure OPENAI_API_KEY or install Piper or espeak-ng.')
  }

  return autoProviders
}

function normalizeProvider(value) {
  const normalized = String(value || TTS_PROVIDERS.AUTO).trim().toLowerCase()

  if (Object.values(TTS_PROVIDERS).includes(normalized)) {
    return normalized
  }

  return TTS_PROVIDERS.AUTO
}

module.exports = {
  TTS_PROVIDERS,
  resolveTtsProvider,
  resolveTtsProviderOrder
}
