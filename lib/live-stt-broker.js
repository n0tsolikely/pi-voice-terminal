const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

class LiveSttBroker {
  constructor({
    baseDir,
    modelPath = '',
    language = 'en',
    logger = null,
    send = () => {},
    runCommand,
    pythonOverride = process.env.LOCAL_STT_PYTHON || '',
    spawnChild = spawn
  }) {
    this.baseDir = baseDir
    this.modelPath = modelPath
    this.language = language
    this.logger = logger
    this.send = send
    this.runCommand = runCommand
    this.pythonOverride = pythonOverride
    this.spawnChild = spawnChild
    this.worker = null
    this.workerStdoutBuffer = ''
    this.workerReadyPromise = null
    this.pendingRequests = new Map()
    this.activeSessions = new Set()
  }

  get workerScriptPath() {
    return path.join(this.baseDir, 'scripts', 'vosk_worker.py')
  }

  isConfigured() {
    return Boolean(this.modelPath && fs.existsSync(this.modelPath))
  }

  async prepareRuntime(onStatus = () => {}) {
    if (!this.isConfigured()) {
      throw new Error('VOSK_MODEL_PATH is missing or does not exist.')
    }

    onStatus('Preparing local Vosk runtime...')
    await this.ensureWorker()
  }

  async startSession({ sessionId, language = this.language }) {
    if (!sessionId) {
      throw new Error('Live STT session ID is required.')
    }

    await this.ensureWorker()
    this.activeSessions.add(sessionId)
    this.sendCommand({
      type: 'start_session',
      sessionId,
      language
    })
  }

  async pushAudio({ sessionId, audioBuffer }) {
    if (!this.worker || !sessionId || !audioBuffer?.byteLength) {
      return
    }

    this.sendCommand({
      type: 'audio_chunk',
      sessionId,
      audioBase64: Buffer.from(audioBuffer).toString('base64')
    })
  }

  async stopSession({ sessionId }) {
    if (!this.worker || !sessionId) {
      return
    }

    this.sendCommand({
      type: 'stop_session',
      sessionId
    })
  }

  async disposeSession({ sessionId }) {
    if (!this.worker || !sessionId) {
      return
    }

    this.activeSessions.delete(sessionId)
    this.sendCommand({
      type: 'dispose_session',
      sessionId
    })
  }

  async transcribeAudio(audioBuffer, mimeType, onStatus = () => {}) {
    if (!this.isConfigured()) {
      throw new Error('VOSK_MODEL_PATH is missing or does not exist.')
    }

    await this.ensureWorker()
    onStatus('Running local Vosk transcription...')

    const requestId = crypto.randomUUID()
    const tempToken = crypto.randomUUID()
    const inputPath = path.join(os.tmpdir(), `pi-voice-terminal-${tempToken}${resolveInputExtension(mimeType)}`)
    const wavPath = path.join(os.tmpdir(), `pi-voice-terminal-${tempToken}.wav`)

    await fs.promises.writeFile(inputPath, Buffer.from(audioBuffer))
    await this.convertToWav(inputPath, wavPath)

    try {
      return await this.requestResponse(requestId, () => {
        this.sendCommand({
          type: 'transcribe_file',
          requestId,
          wavPath
        })
      })
    } finally {
      fs.promises.unlink(inputPath).catch(() => {})
      fs.promises.unlink(wavPath).catch(() => {})
    }
  }

  async dispose() {
    if (!this.worker) {
      return
    }

    this.sendCommand({
      type: 'shutdown'
    })
    this.worker.kill()
    this.worker = null
    this.workerReadyPromise = null
    this.pendingRequests.clear()
    this.activeSessions.clear()
  }

  async ensureWorker() {
    if (this.worker) {
      return this.worker
    }

    if (!this.workerReadyPromise) {
      this.workerReadyPromise = this.startWorker().catch((error) => {
        this.workerReadyPromise = null
        throw error
      })
    }

    return this.workerReadyPromise
  }

  async startWorker() {
    const launcher = await this.resolvePythonLauncher()
    const child = this.spawnChild(launcher.command, [
      ...launcher.args,
      this.workerScriptPath,
      '--model-path',
      this.modelPath,
      '--language',
      this.language
    ], {
      cwd: this.baseDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.worker = child
    this.workerStdoutBuffer = ''
    child.stdout?.setEncoding?.('utf8')
    child.stderr?.setEncoding?.('utf8')
    child.stdout?.on('data', (chunk) => {
      this.handleWorkerStdout(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      this.logger?.log('stt.live_worker_stderr', {
        message: String(chunk || '').trim()
      })
    })
    child.on('exit', (code, signal) => {
      const message = `Live STT worker exited (${code ?? 'null'}${signal ? `, ${signal}` : ''}).`
      this.logger?.log('stt.live_worker_exit', {
        code,
        signal
      })
      this.rejectPendingRequests(new Error(message))
      this.worker = null
      this.workerReadyPromise = null
      this.activeSessions.clear()
    })

    return child
  }

  async resolvePythonLauncher() {
    const candidates = []

    if (this.pythonOverride) {
      candidates.push({
        command: this.pythonOverride,
        args: []
      })
    }

    candidates.push(
      { command: 'python3', args: [] },
      { command: 'python', args: [] }
    )

    for (const candidate of candidates) {
      try {
        await this.runCommand(candidate.command, [...candidate.args, '--version'], {
          cwd: this.baseDir
        })
        return candidate
      } catch (_error) {
        // Try the next available launcher.
      }
    }

    throw new Error('Python 3 is required for the local Vosk runtime.')
  }

  async convertToWav(inputPath, outputPath) {
    await this.runCommand('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'wav',
      outputPath
    ], {
      cwd: this.baseDir
    })
  }

  requestResponse(requestId, sendCommand) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject
      })

      try {
        sendCommand()
      } catch (error) {
        this.pendingRequests.delete(requestId)
        reject(error)
      }
    })
  }

  sendCommand(command) {
    if (!this.worker?.stdin?.writable) {
      throw new Error('Live STT worker is not available.')
    }

    this.worker.stdin.write(`${JSON.stringify(command)}\n`)
  }

  handleWorkerStdout(chunk) {
    this.workerStdoutBuffer += String(chunk || '')
    const lines = this.workerStdoutBuffer.split('\n')
    this.workerStdoutBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed) {
        continue
      }

      let payload = null

      try {
        payload = JSON.parse(trimmed)
      } catch (_error) {
        this.logger?.log('stt.live_worker_parse_error', {
          raw: trimmed
        })
        continue
      }

      this.handleWorkerPayload(payload)
    }
  }

  handleWorkerPayload(payload) {
    switch (payload.type) {
      case 'status':
        this.logger?.log('stt.live_status', payload)
        this.send('stt:live-status', payload)
        return
      case 'partial':
        this.logger?.log('stt.live_partial', payload)
        this.send('stt:live-partial', payload)
        return
      case 'final':
        this.logger?.log('stt.live_final', payload)
        this.send('stt:live-final', payload)
        return
      case 'session_stopped':
        this.activeSessions.delete(payload.sessionId)
        this.logger?.log('stt.live_status', payload)
        this.send('stt:live-status', payload)
        return
      case 'transcription_result': {
        const pending = this.pendingRequests.get(payload.requestId)

        if (!pending) {
          return
        }

        this.pendingRequests.delete(payload.requestId)
        pending.resolve(String(payload.text || '').trim())
        return
      }
      case 'error': {
        const error = new Error(payload.message || 'Live STT worker error.')
        const pending = payload.requestId ? this.pendingRequests.get(payload.requestId) : null

        this.logger?.log('stt.live_error', payload)
        this.send('stt:live-error', payload)

        if (pending) {
          this.pendingRequests.delete(payload.requestId)
          pending.reject(error)
        }

        return
      }
      default:
        this.logger?.log('stt.live_unknown', payload)
    }
  }

  rejectPendingRequests(error) {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }

    this.pendingRequests.clear()
  }
}

function resolveInputExtension(mimeType) {
  const extensionMap = {
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/webm': '.webm'
  }

  return extensionMap[String(mimeType || '').trim().toLowerCase()] || '.webm'
}

function createMockWorker() {
  const worker = new EventEmitter()
  worker.stdout = new EventEmitter()
  worker.stderr = new EventEmitter()
  worker.stdin = new EventEmitter()
  worker.stdin.writable = true
  worker.stdin.write = (value) => {
    worker.stdin.emit('write', value)
    return true
  }
  worker.kill = () => {
    worker.emit('exit', 0, null)
  }
  return worker
}

module.exports = {
  LiveSttBroker,
  createMockWorker,
  resolveInputExtension
}
