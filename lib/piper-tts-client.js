const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

class PiperTtsClient {
  constructor({
    baseDir,
    runCommand,
    bin = process.env.PIPER_BIN || 'piper',
    voiceModel = process.env.PIPER_VOICE_MODEL || '',
    maxTtsChars = 4000
  }) {
    this.baseDir = baseDir
    this.runCommand = runCommand
    this.bin = String(bin || 'piper').trim() || 'piper'
    this.voiceModel = String(voiceModel || '').trim()
    this.maxTtsChars = maxTtsChars
  }

  isAvailable() {
    return Boolean(this.voiceModel)
  }

  async synthesizeSpeech(text) {
    const speechInput = String(text || '').trim().slice(0, this.maxTtsChars)

    if (!speechInput) {
      return null
    }

    if (!this.isAvailable()) {
      throw new Error('Piper TTS is unavailable because PIPER_VOICE_MODEL is not configured.')
    }

    const outPath = path.join(os.tmpdir(), `pi-voice-terminal-${crypto.randomUUID()}.wav`)

    try {
      await this.runCommand(this.bin, [
        '--model',
        resolvePath(this.baseDir, this.voiceModel),
        '--output_file',
        outPath
      ], {
        cwd: this.baseDir,
        input: speechInput
      })

      return await fs.promises.readFile(outPath)
    } catch (error) {
      throw new Error(`Piper TTS failed: ${error.message}`)
    } finally {
      fs.promises.unlink(outPath).catch(() => {})
    }
  }
}

function resolvePath(baseDir, candidate) {
  return path.isAbsolute(candidate) ? candidate : path.join(baseDir, candidate)
}

module.exports = {
  PiperTtsClient
}
