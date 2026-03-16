#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadDotEnv, resolveAppPath } = require('../lib/app-env')
const { LiveSttBroker } = require('../lib/live-stt-broker')
const { OpenAiAudioClient } = require('../lib/openai-audio-client')
const { runCommand } = require('../lib/run-command')

const repoRoot = path.join(__dirname, '..')
const envPath = path.join(repoRoot, '.env')

loadDotEnv(envPath)

const captureSeconds = resolveDuration(process.argv[2])
const recordingToken = crypto.randomUUID()
const wavPath = path.join(os.tmpdir(), `pi-voice-terminal-mic-${recordingToken}.wav`)
const pcmPath = path.join(os.tmpdir(), `pi-voice-terminal-mic-${recordingToken}.pcm`)
const modelPath = resolveAppPath(
  repoRoot,
  process.env.VOSK_MODEL_PATH,
  path.join(repoRoot, '.local-stt', 'models', 'vosk-model-small-en-us-0.15')
)

async function main() {
  await assertCaptureDevice()

  process.stdout.write(
    `Recording ${captureSeconds}s from the default microphone. Speak a short sentence now.\n`
  )

  await runCommand(
    'arecord',
    ['-q', '-f', 'S16_LE', '-c', '1', '-r', '16000', '-d', String(captureSeconds), wavPath],
    {
      cwd: repoRoot
    }
  )

  const audioBuffer = await fs.promises.readFile(wavPath)

  if (fs.existsSync(modelPath)) {
    await runLocalVerification(audioBuffer)
    return
  }

  await runOpenAiVerification(audioBuffer)
}

async function runLocalVerification(audioBuffer) {
  let finalResolved = false
  let resolveFinal = () => {}
  let rejectFinal = () => {}
  const finalTranscript = new Promise((resolve, reject) => {
    resolveFinal = resolve
    rejectFinal = reject
  })

  const broker = new LiveSttBroker({
    baseDir: repoRoot,
    runCommand,
    modelPath,
    language: process.env.LOCAL_STT_LANGUAGE || 'en',
    send: (channel, payload) => {
      if (channel === 'stt:live-partial' && payload?.text) {
        process.stdout.write(`[partial] ${payload.text}\n`)
      }

      if (channel === 'stt:live-final') {
        finalResolved = true
        resolveFinal(payload?.text || '')
      }

      if (channel === 'stt:live-error') {
        rejectFinal(new Error(payload?.message || 'Local Vosk verification failed.'))
      }
    }
  })

  const sessionId = crypto.randomUUID()

  try {
    await broker.prepareRuntime((message) => {
      process.stdout.write(`[stt] ${message}\n`)
    })

    await runCommand(
      'ffmpeg',
      ['-y', '-i', wavPath, '-f', 's16le', '-ac', '1', '-ar', '16000', pcmPath],
      {
        cwd: repoRoot
      }
    )

    const pcmBuffer = await fs.promises.readFile(pcmPath)

    await broker.startSession({
      sessionId,
      language: process.env.LOCAL_STT_LANGUAGE || 'en'
    })

    for (let offset = 0; offset < pcmBuffer.length; offset += 5120) {
      await broker.pushAudio({
        sessionId,
        audioBuffer: pcmBuffer.subarray(offset, offset + 5120)
      })
      await delay(25)
    }

    await broker.stopSession({ sessionId })
    const transcript = await Promise.race([
      finalTranscript,
      delay(10000).then(() => {
        if (!finalResolved) {
          return ''
        }

        return ''
      })
    ])

    process.stdout.write(`[final] ${transcript || '<empty transcript>'}\n`)
  } finally {
    await broker.disposeSession({ sessionId }).catch(() => {})
    await broker.dispose().catch(() => {})
    await cleanup()
  }
}

async function runOpenAiVerification(audioBuffer) {
  const client = new OpenAiAudioClient({
    apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
    ttsModel: process.env.OPENAI_TTS_MODEL || 'tts-1',
    ttsVoice: process.env.OPENAI_TTS_VOICE || 'alloy',
    ttsFormat: 'mp3'
  })

  if (!client.hasApiKey()) {
    await cleanup()
    throw new Error(
      'No local Vosk model was found and OPENAI_API_KEY is not configured. Run npm run setup:raspi first.'
    )
  }

  process.stdout.write(
    '[note] Local Vosk is not configured, so this verification only checks batch OpenAI transcription.\n'
  )

  try {
    const transcript = await client.transcribeAudio(audioBuffer, 'audio/wav')
    process.stdout.write(`[final] ${transcript || '<empty transcript>'}\n`)
  } finally {
    await cleanup()
  }
}

async function assertCaptureDevice() {
  try {
    await runCommand('arecord', ['-l'], {
      cwd: repoRoot
    })
  } catch (error) {
    throw new Error(
      `No ALSA capture device is available. Check the Pi microphone path with arecord -l. ${error.message}`
    )
  }
}

function resolveDuration(rawValue) {
  const parsed = Number.parseInt(rawValue, 10)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 15) {
    return 4
  }

  return parsed
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function cleanup() {
  await fs.promises.unlink(wavPath).catch(() => {})
  await fs.promises.unlink(pcmPath).catch(() => {})
}

main().catch(async (error) => {
  await cleanup()
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
