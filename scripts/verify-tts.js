#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadDotEnv, resolveAppPath } = require('../lib/app-env')
const { EspeakNgTtsClient } = require('../lib/espeak-ng-tts-client')
const { OpenAiAudioClient } = require('../lib/openai-audio-client')
const { PiperTtsClient } = require('../lib/piper-tts-client')
const { runCommand } = require('../lib/run-command')
const { TTS_PROVIDERS } = require('../lib/tts-provider-selection')
const { TtsService } = require('../lib/tts-service')

const repoRoot = path.join(__dirname, '..')

loadDotEnv(path.join(repoRoot, '.env'))

async function main() {
  const sampleText =
    process.argv.slice(2).join(' ').trim() || 'Pi Voice Terminal text to speech verification.'
  const tempToken = crypto.randomUUID()
  const rawAudioPath = path.join(os.tmpdir(), `pi-voice-terminal-tts-${tempToken}.bin`)
  const wavPath = path.join(os.tmpdir(), `pi-voice-terminal-tts-${tempToken}.wav`)

  const openAiAudioClient = new OpenAiAudioClient({
    apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
    ttsModel: process.env.OPENAI_TTS_MODEL || 'tts-1',
    ttsVoice: process.env.OPENAI_TTS_VOICE || 'alloy',
    ttsFormat: 'mp3'
  })
  const piperTtsClient = new PiperTtsClient({
    baseDir: repoRoot,
    runCommand,
    bin: process.env.PIPER_BIN || 'piper',
    voiceModel: process.env.PIPER_VOICE_MODEL || ''
  })
  const espeakTtsClient = new EspeakNgTtsClient({
    baseDir: repoRoot,
    runCommand,
    voice: process.env.ESPEAK_VOICE || 'en-us'
  })
  const ttsService = new TtsService({
    requestedProvider: process.env.TTS_PROVIDER || TTS_PROVIDERS.AUTO,
    openAiAudioClient,
    piperTtsClient,
    espeakTtsClient
  })

  const payload = await ttsService.synthesizeSpeech(sampleText)

  if (!payload?.audioBuffer) {
    throw new Error('The selected TTS provider did not return any audio.')
  }

  try {
    await fs.promises.writeFile(rawAudioPath, payload.audioBuffer)

    if (payload.mimeType === 'audio/mpeg') {
      await runCommand(
        'ffmpeg',
        ['-y', '-i', rawAudioPath, '-f', 'wav', wavPath],
        {
          cwd: repoRoot
        }
      )
    } else {
      await fs.promises.copyFile(rawAudioPath, wavPath)
    }

    await runCommand('aplay', [wavPath], {
      cwd: repoRoot
    })

    process.stdout.write(`TTS verification succeeded with provider: ${payload.provider}\n`)
  } finally {
    await fs.promises.unlink(rawAudioPath).catch(() => {})
    await fs.promises.unlink(wavPath).catch(() => {})
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
