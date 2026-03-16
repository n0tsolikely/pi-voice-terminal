const { app, BrowserWindow, clipboard, ipcMain, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const pty = require('node-pty')
const packageManifest = require('./package.json')
const { AppUpdater, buildUpdatePrompt } = require('./lib/app-updater')
const {
  normalizeClipboardText,
  normalizeLiveSttAudioPayload,
  normalizeLiveSttControlPayload,
  normalizePreviewSpeechPayload,
  normalizePtyDimensions,
  normalizePtyInput,
  normalizeRuntimeLogPayload,
  normalizeSpeechEnabled,
  normalizeTranscribePayload,
  normalizeUpdateAction
} = require('./lib/ipc-contracts')
const { LiveSttBroker } = require('./lib/live-stt-broker')
const { LocalTtsClient } = require('./lib/local-tts-client')
const { OpenAiAudioClient, isInvalidApiKeyError } = require('./lib/openai-audio-client')
const { RuntimeLogger } = require('./lib/runtime-logger')
const { runCommand } = require('./lib/run-command')
const {
  providerSupportsLiveStt,
  resolveSttProvider,
  STT_PROVIDERS
} = require('./lib/stt-provider-selection')
const { TerminalSession } = require('./lib/terminal-session')
const { TTS_PROVIDERS } = require('./lib/tts-provider-selection')
const { TtsService } = require('./lib/tts-service')

loadDotEnv(path.join(__dirname, '.env'))

const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1'
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'tts-1'
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy'
const TTS_FORMAT = 'mp3'
const STT_PROVIDER = process.env.STT_PROVIDER || STT_PROVIDERS.AUTO
const TTS_PROVIDER = process.env.TTS_PROVIDER || TTS_PROVIDERS.AUTO
const LOCAL_TTS_VOICE = process.env.LOCAL_TTS_VOICE || ''
const LOCAL_STT_LANGUAGE = process.env.LOCAL_STT_LANGUAGE || 'en'
const VOSK_MODEL_PATH = resolveAppPath(
  process.env.VOSK_MODEL_PATH,
  path.join(__dirname, '.local-stt', 'models', 'vosk-model-small-en-us-0.15')
)

let mainWindow = null
let terminalSession = null
let hasCheckedForAppUpdate = false
let activeUpdateInfo = null
let isApplyingAppUpdate = false
let isAppQuitting = false
let closeVaporizeTimeoutId = null
let isCloseVaporizePending = false
let isCloseVaporizeForced = false
const statusNoticeKeys = new Set()
const runtimeLogger = new RuntimeLogger({
  baseDir: __dirname
})
const appLogger = runtimeLogger.child({
  component: 'app',
  processType: 'main'
})
const openAIClient = new OpenAiAudioClient({
  apiBase: OPENAI_API_BASE,
  apiKey: process.env.OPENAI_API_KEY || '',
  transcriptionModel: TRANSCRIPTION_MODEL,
  ttsModel: TTS_MODEL,
  ttsVoice: TTS_VOICE,
  ttsFormat: TTS_FORMAT
})
const localTtsClient = new LocalTtsClient({
  baseDir: __dirname,
  runCommand,
  voice: LOCAL_TTS_VOICE
})
const ttsService = new TtsService({
  requestedProvider: TTS_PROVIDER,
  openAiAudioClient: openAIClient,
  localTtsClient
})
const liveSttBroker = new LiveSttBroker({
  baseDir: __dirname,
  runCommand,
  modelPath: VOSK_MODEL_PATH,
  language: LOCAL_STT_LANGUAGE,
  logger: appLogger.child({
    component: 'stt-live'
  }),
  send: (channel, payload) => terminalSession?.send(channel, payload)
})
const appUpdater = new AppUpdater({
  baseDir: __dirname,
  runCommand,
  fetchImpl: fetch,
  appVersion: packageManifest.version
})

function createWindow() {
  isCloseVaporizePending = false
  isCloseVaporizeForced = false
  clearCloseVaporizeTimeout()

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#111111',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  const windowLogger = runtimeLogger.child({
    component: 'window',
    processType: 'main',
    windowId: mainWindow.id
  })
  terminalSession = new TerminalSession({
    window: mainWindow,
    ttsService,
    spawnPty: pty.spawn,
    logger: windowLogger.child({
      component: 'terminal'
    })
  })
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.webContents.once('did-finish-load', () => {
    announceInitialSpeechMode()
    warmLocalSttRuntime()
  })
  windowLogger.log('window.created', {
    width: 1440,
    height: 900
  })

  mainWindow.on('closed', () => {
    clearCloseVaporizeTimeout()
    isCloseVaporizePending = false
    isCloseVaporizeForced = false
    terminalSession?.dispose()
    void liveSttBroker.dispose().catch(() => {})
    terminalSession = null
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (
      isAppQuitting ||
      isApplyingAppUpdate ||
      isCloseVaporizeForced ||
      !mainWindow ||
      mainWindow.webContents.isDestroyed() ||
      mainWindow.webContents.isLoadingMainFrame()
    ) {
      return
    }

    event.preventDefault()

    if (isCloseVaporizePending) {
      return
    }

    isCloseVaporizePending = true
    runtimeLogger.log('window.close_vaporize_requested', {
      windowId: mainWindow.id
    }, {
      component: 'window',
      processType: 'main',
      windowId: mainWindow.id
    })
    closeVaporizeTimeoutId = setTimeout(() => {
      finalizeWindowClose('timeout')
    }, 1000)
    beginWindowCloseVaporize(mainWindow).catch((error) => {
      runtimeLogger.log('window.close_vaporize_failed', {
        message: error instanceof Error ? error.message : String(error)
      }, {
        component: 'window',
        processType: 'main',
        windowId: mainWindow?.id || null
      })
      finalizeWindowClose('capture-error')
    })
  })
}

app.whenReady().then(() => {
  runtimeLogger.initSession()
  appLogger.log('app.ready', {
    platform: process.platform,
    runtime: runtimeLogger.getInfo()
  })
  configureMediaPermissions(session.defaultSession)

  ipcMain.handle('pty:start', async (_event, dimensions) => {
    terminalSession?.start(normalizePtyDimensions(dimensions))
    queueStartupUpdateCheck()
    return { ok: true }
  })

  ipcMain.on('pty:input', (_event, data) => {
    terminalSession?.write(normalizePtyInput(data))
  })

  ipcMain.on('pty:resize', (_event, dimensions) => {
    terminalSession?.resize(normalizePtyDimensions(dimensions))
  })

  ipcMain.on('runtime:log', (_event, payload = {}) => {
    const window = BrowserWindow.fromWebContents(_event.sender)
    const normalizedPayload = normalizeRuntimeLogPayload(payload)

    runtimeLogger.log(normalizedPayload.type, normalizedPayload.payload, {
      component: 'renderer',
      processType: 'renderer',
      webContentsId: _event.sender.id,
      windowId: window?.id || null
    })
  })

  ipcMain.handle('runtime:info', async () => {
    return runtimeLogger.getInfo()
  })

  ipcMain.handle('clipboard:read-text', async () => clipboard.readText())

  ipcMain.handle('clipboard:write-text', async (_event, text) => {
    clipboard.writeText(normalizeClipboardText(text))
    return { ok: true }
  })

  ipcMain.handle('app:update-response', async (_event, action) => {
    const normalizedAction = normalizeUpdateAction(action)

    if (!activeUpdateInfo) {
      return {
        ok: true,
        dismissed: true
      }
    }

    if (normalizedAction !== 'accept') {
      runtimeLogger.log('app.update_prompt_dismissed', {
        action: normalizedAction
      })
      activeUpdateInfo = null

      return {
        ok: true,
        dismissed: true
      }
    }

    if (isApplyingAppUpdate) {
      return {
        ok: true,
        pending: true
      }
    }

    isApplyingAppUpdate = true

    runtimeLogger.log('app.update_apply_started', {
      strategy: activeUpdateInfo.strategy,
      currentLabel: activeUpdateInfo.currentLabel,
      latestLabel: activeUpdateInfo.latestLabel
    })
    sendStatus('Updating Pi Voice Terminal. The app will restart when it finishes.')

    try {
      const result = await appUpdater.applyUpdate()

      runtimeLogger.log('app.update_apply_ready', result)

      app.relaunch()
      app.exit(0)
      return {
        ok: true,
        relaunching: true
      }
    } catch (error) {
      isApplyingAppUpdate = false
      activeUpdateInfo = null
      runtimeLogger.log('app.update_apply_failed', {
        message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  })

  ipcMain.handle('app:close-vaporize-complete', async (_event) => {
    const window = BrowserWindow.fromWebContents(_event.sender)

    if (!window || window !== mainWindow || !isCloseVaporizePending) {
      return {
        ok: false
      }
    }

    finalizeWindowClose('renderer')
    return {
      ok: true
    }
  })

  ipcMain.handle('stt:live-start', async (_event, payload) => {
    const normalizedPayload = normalizeLiveSttControlPayload(payload)
    const provider = resolveRequestedSttProvider()

    if (!providerSupportsLiveStt(provider)) {
      sendStatusOnce(
        `stt.live_unavailable.${provider}`,
        'Live interim dictation is unavailable with the current STT provider. Capture will be transcribed after you stop recording.'
      )

      return {
        ok: false,
        provider,
        liveSupported: false
      }
    }

    await liveSttBroker.startSession(normalizedPayload)
    runtimeLogger.log('stt.live_started', {
      provider,
      sessionId: normalizedPayload.sessionId,
      language: normalizedPayload.language
    })

    return {
      ok: true,
      provider,
      liveSupported: true
    }
  })

  ipcMain.on('stt:live-audio', (_event, payload) => {
    const normalizedPayload = normalizeLiveSttAudioPayload(payload)

    liveSttBroker.pushAudio(normalizedPayload).catch((error) => {
      runtimeLogger.log('stt.live_error', {
        sessionId: normalizedPayload.sessionId,
        message: error instanceof Error ? error.message : String(error)
      })
      terminalSession?.send('stt:live-error', {
        sessionId: normalizedPayload.sessionId,
        message: error instanceof Error ? error.message : String(error)
      })
    })
  })

  ipcMain.handle('stt:live-stop', async (_event, payload) => {
    const normalizedPayload = normalizeLiveSttControlPayload(payload)

    await liveSttBroker.stopSession(normalizedPayload)
    runtimeLogger.log('stt.live_stopping', {
      sessionId: normalizedPayload.sessionId
    })

    return {
      ok: true
    }
  })

  ipcMain.handle('stt:live-dispose', async (_event, payload) => {
    const normalizedPayload = normalizeLiveSttControlPayload(payload)

    await liveSttBroker.disposeSession(normalizedPayload)
    runtimeLogger.log('stt.live_disposed', {
      sessionId: normalizedPayload.sessionId
    })

    return {
      ok: true
    }
  })

  ipcMain.handle('stt:transcribe', async (_event, payload) => {
    const normalizedPayload = normalizeTranscribePayload(payload)
    const requestedProvider = resolveRequestedSttProvider()

    runtimeLogger.log('stt.request', {
      provider: requestedProvider,
      apiKeyState: openAIClient.getApiKeyState().reason,
      mimeType: normalizedPayload.mimeType || ''
    })

    try {
      if (requestedProvider === STT_PROVIDERS.LOCAL) {
        return await transcribeWithLocalVosk(normalizedPayload)
      }

      const transcript = await openAIClient.transcribeAudio(
        normalizedPayload.audioBuffer,
        normalizedPayload.mimeType
      )

      runtimeLogger.log('stt.success', {
        provider: 'openai',
        text: transcript
      })
      return transcript
    } catch (error) {
      if (!isInvalidApiKeyError(error) || requestedProvider !== STT_PROVIDERS.OPENAI) {
        runtimeLogger.log('stt.error', {
          provider: requestedProvider,
          message: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
      throw error
    }
  })

  ipcMain.handle('speech:preview', async (_event, payload) => {
    const normalizedPayload = normalizePreviewSpeechPayload(payload)

    runtimeLogger.log('speech.preview_request', {
      text: normalizedPayload.text || ''
    })

    const audioPayload = await ttsService.synthesizeSpeech(normalizedPayload.text || '')

    runtimeLogger.log('speech.preview_ready', {
      provider: audioPayload?.provider || '',
      mimeType: audioPayload?.mimeType || '',
      text: normalizedPayload.text || ''
    })

    return {
      audioBase64: audioPayload?.audioBuffer ? audioPayload.audioBuffer.toString('base64') : '',
      mimeType: audioPayload?.mimeType || 'audio/mpeg',
      provider: audioPayload?.provider || '',
      text: normalizedPayload.text || ''
    }
  })

  ipcMain.handle('speech:set-enabled', async (_event, enabled) => {
    const normalizedEnabled = normalizeSpeechEnabled(enabled)

    terminalSession?.setAutoReplySpeechEnabled(normalizedEnabled)
    runtimeLogger.log('speech.auto_reply_toggled', {
      enabled: normalizedEnabled
    })

    return {
      ok: true,
      enabled: normalizedEnabled
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', async () => {
  isAppQuitting = true
  await liveSttBroker.dispose().catch(() => {})
  await appLogger.log('app.before_quit', {})
  await runtimeLogger.flush()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function configureMediaPermissions(electronSession) {
  if (!electronSession) {
    return
  }

  if (typeof electronSession.setDevicePermissionHandler === 'function') {
    electronSession.setDevicePermissionHandler((details) => {
      runtimeLogger.log('permissions.device_request', {
        deviceType: details.deviceType || ''
      }, {
        component: 'permissions',
        processType: 'main'
      })
      return details.deviceType === 'audioCapture'
    })
  }

  electronSession.setPermissionCheckHandler((_webContents, permission, _origin, details = {}) => {
    const allowed = isAudioMediaPermission(permission, details)

    runtimeLogger.log('permissions.check', {
      permission,
      mediaType: details.mediaType || '',
      mediaTypes: details.mediaTypes || [],
      allowed
    }, {
      component: 'permissions',
      processType: 'main'
    })

    return allowed
  })

  electronSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details = {}) => {
      const allowed = isAudioMediaPermission(permission, details)

      runtimeLogger.log('permissions.request', {
        permission,
        mediaType: details.mediaType || '',
        mediaTypes: details.mediaTypes || [],
        allowed
      }, {
        component: 'permissions',
        processType: 'main'
      })
      callback(allowed)
    }
  )
}

async function beginWindowCloseVaporize(window) {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    finalizeWindowClose('window-missing')
    return
  }

  const snapshot = await window.webContents.capturePage()

  if (!window || window.isDestroyed() || window.webContents.isDestroyed() || !isCloseVaporizePending) {
    finalizeWindowClose('window-missing')
    return
  }

  const bounds = window.getContentBounds()

  window.webContents.send('app:begin-close-vaporize', {
    imageDataUrl: snapshot.toDataURL(),
    durationMs: 760,
    width: bounds.width,
    height: bounds.height
  })
}

function finalizeWindowClose(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    clearCloseVaporizeTimeout()
    isCloseVaporizePending = false
    isCloseVaporizeForced = false
    return
  }

  runtimeLogger.log('window.close_vaporize_completed', {
    reason
  }, {
    component: 'window',
    processType: 'main',
    windowId: mainWindow.id
  })
  clearCloseVaporizeTimeout()
  isCloseVaporizePending = false
  isCloseVaporizeForced = true
  mainWindow.close()
}

function clearCloseVaporizeTimeout() {
  if (closeVaporizeTimeoutId) {
    clearTimeout(closeVaporizeTimeoutId)
    closeVaporizeTimeoutId = null
  }
}

function announceInitialSpeechMode() {
  const apiKeyState = openAIClient.getApiKeyState()

  if (liveSttBroker.isConfigured()) {
    if (apiKeyState.reason === 'missing' || apiKeyState.reason === 'placeholder') {
      sendStatusOnce(`stt.local_only.${apiKeyState.reason}`, getLocalOnlyMessage(apiKeyState.reason))
    }
    return
  }

  if (apiKeyState.available) {
    sendStatusOnce(
      'stt.openai_only',
      'OpenAI transcription is configured, but no local Vosk model was found. Live interim dictation is unavailable until you run setup:raspi.'
    )
    return
  }

  sendStatusOnce(
    `stt.runtime_missing.${apiKeyState.reason || 'missing'}`,
    'No local Vosk model was found. Run setup:raspi to enable live dictation or configure OPENAI_API_KEY for batch transcription.'
  )
}

function queueStartupUpdateCheck() {
  if (hasCheckedForAppUpdate) {
    return
  }

  hasCheckedForAppUpdate = true

  checkForAppUpdate().catch((error) => {
    runtimeLogger.log('app.update_check_failed', {
      message: error instanceof Error ? error.message : String(error)
    })
  })
}

async function checkForAppUpdate() {
  const updateInfo = await appUpdater.checkForUpdate()

  runtimeLogger.log('app.update_check', {
    available: updateInfo.available,
    strategy: updateInfo.strategy || '',
    reason: updateInfo.reason || '',
    currentLabel: updateInfo.currentLabel || '',
    latestLabel: updateInfo.latestLabel || '',
    migratesToStablePath: Boolean(updateInfo.migratesToStablePath)
  })

  if (!updateInfo.available) {
    return
  }

  activeUpdateInfo = updateInfo
  terminalSession?.send('app:update-available', {
    title: 'Update Available',
    message: buildUpdatePrompt(updateInfo),
    currentLabel: updateInfo.currentLabel,
    latestLabel: updateInfo.latestLabel,
    confirmLabel: 'Yes, update',
    cancelLabel: 'No'
  })
}

function sendStatus(message) {
  if (!message) {
    return
  }

  terminalSession?.send('app:status', { message })
}

function sendStatusOnce(key, message) {
  if (!key || !message || statusNoticeKeys.has(key)) {
    return
  }

  statusNoticeKeys.add(key)
  runtimeLogger.log('app.status', {
    key,
    message
  })
  sendStatus(message)
}

function resolveRequestedSttProvider() {
  return resolveSttProvider({
    requestedProvider: STT_PROVIDER,
    hasOpenAiKey: openAIClient.hasApiKey(),
    hasLocalRuntime: liveSttBroker.isConfigured()
  })
}

function forwardLocalSttStatus(message) {
  runtimeLogger.log('stt.status', {
    provider: 'local-vosk',
    message
  })
  sendStatus(message)
}

function warmLocalSttRuntime() {
  if (!liveSttBroker.isConfigured()) {
    return
  }

  liveSttBroker.prepareRuntime((message) => {
    forwardLocalSttStatus(message)
  }).catch((error) => {
    runtimeLogger.log('stt.runtime_setup_failed', {
      provider: 'local-vosk',
      message: error instanceof Error ? error.message : String(error)
    })
  })
}

async function transcribeWithLocalVosk(normalizedPayload) {
  const transcript = await liveSttBroker.transcribeAudio(
    normalizedPayload.audioBuffer,
    normalizedPayload.mimeType,
    (message) => {
      forwardLocalSttStatus(message)
    }
  )

  runtimeLogger.log('stt.success', {
    provider: 'local-vosk',
    text: transcript
  })

  return transcript
}

function getLocalOnlyMessage(reason) {
  if (reason === 'auth-failed') {
    return 'OpenAI API key was rejected. Using local Vosk for this session.'
  }

  return 'No valid OpenAI API key found. Using local Vosk.'
}

function isAudioMediaPermission(permission, details = {}) {
  if (permission === 'audioCapture') {
    return true
  }

  if (permission !== 'media') {
    return false
  }

  if (Array.isArray(details.mediaTypes)) {
    return details.mediaTypes.includes('audio')
  }

  return details.mediaType === 'audio'
}

function loadDotEnv(dotEnvPath) {
  if (!fs.existsSync(dotEnvPath)) {
    return
  }

  const raw = fs.readFileSync(dotEnvPath, 'utf8')

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()

    if (!key || process.env[key]) {
      continue
    }

    let value = trimmed.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function resolveAppPath(value, fallbackPath) {
  const normalized = String(value || '').trim()

  if (!normalized) {
    return fallbackPath
  }

  return path.isAbsolute(normalized) ? normalized : path.join(__dirname, normalized)
}
