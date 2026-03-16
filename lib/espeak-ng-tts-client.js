const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

class EspeakNgTtsClient {
  constructor({
    baseDir,
    runCommand,
    bin = process.env.ESPEAK_BIN || 'espeak-ng',
    voice = process.env.ESPEAK_VOICE || 'en-us',
    maxTtsChars = 4000
  }) {
    this.baseDir = baseDir
    this.runCommand = runCommand
    this.bin = String(bin || 'espeak-ng').trim() || 'espeak-ng'
    this.voice = String(voice || 'en-us').trim() || 'en-us'
    this.maxTtsChars = maxTtsChars
  }

  isAvailable() {
    return Boolean(this.bin)
  }

  async synthesizeSpeech(text) {
    const speechInput = String(text || '').trim().slice(0, this.maxTtsChars)

    if (!speechInput) {
      return null
    }

    const outPath = path.join(os.tmpdir(), `pi-voice-terminal-${crypto.randomUUID()}.wav`)

    try {
      await this.runCommand(this.bin, [
        '-w',
        outPath,
        '-v',
        this.voice,
        speechInput
      ], {
        cwd: this.baseDir
      })

      return await fs.promises.readFile(outPath)
    } catch (error) {
      throw new Error(`espeak-ng TTS failed: ${error.message}`)
    } finally {
      fs.promises.unlink(outPath).catch(() => {})
    }
  }
}

module.exports = {
  EspeakNgTtsClient
}
