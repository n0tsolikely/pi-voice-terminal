const os = require('node:os')
const { SpeechRelay } = require('./speech-relay')

class TerminalSession {
  constructor({
    window,
    ttsService,
    logger = null,
    spawnPty,
    platform = process.platform,
    env = process.env,
    homeDir = os.homedir()
  }) {
    this.window = window
    this.spawnPty = spawnPty
    this.platform = platform
    this.env = env
    this.homeDir = homeDir
    this.logger = logger
    this.ptyProcess = null
    this.speechRelay = new SpeechRelay({
      ttsService,
      logger,
      send: (channel, payload) => this.send(channel, payload)
    })
  }

  start({ cols, rows }) {
    if (this.ptyProcess) {
      return
    }

    if (this.platform !== 'linux') {
      throw new Error('Pi Voice Terminal must be launched on Linux because the backend spawns a native shell.')
    }

    const { shell, args, cwd, env } = resolveShellLaunchConfig({
      env: this.env,
      homeDir: this.homeDir
    })

    this.logger?.log('pty.start', {
      cols,
      rows,
      shell,
      args,
      cwd
    })

    this.ptyProcess = this.spawnPty(shell, args, {
      cols,
      rows,
      cwd,
      env,
      name: 'xterm-256color'
    })

    this.ptyProcess.onData((data) => {
      this.logger?.log('pty.output', {
        data
      })
      this.speechRelay.observeOutput(data)
      this.send('pty:data', data)
    })

    this.ptyProcess.onExit((event) => {
      this.logger?.log('pty.exit', event)
      this.send('pty:exit', event)
      this.ptyProcess = null
    })
  }

  write(data) {
    if (!this.ptyProcess) {
      return
    }

    this.logger?.log('pty.input', {
      data
    })
    this.speechRelay.observeInput(data)
    this.ptyProcess.write(data)
  }

  resize({ cols, rows }) {
    if (!this.ptyProcess) {
      return
    }

    this.logger?.log('pty.resize', {
      cols,
      rows
    })
    this.ptyProcess.resize(cols, rows)
  }

  setAutoReplySpeechEnabled(enabled) {
    this.speechRelay.setAutoReplySpeechEnabled(enabled)
  }

  dispose() {
    this.logger?.log('pty.dispose', {})
    this.speechRelay.dispose()
    this.disposePty()
  }

  disposePty() {
    const processRef = this.ptyProcess
    this.ptyProcess = null

    if (!processRef) {
      return
    }

    try {
      processRef.kill()
    } catch (_error) {
      // The PTY can already be dead by the time Electron tears the window down.
    }
  }

  send(channel, payload) {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.window.webContents.send(channel, payload)
  }
}

function resolveShellLaunchConfig({ env = process.env, homeDir = os.homedir() } = {}) {
  const shell = String(env.PI_SHELL || env.SHELL || '/bin/bash').trim() || '/bin/bash'
  const args = splitArgs(env.PI_SHELL_ARGS || '')
  const cwd = String(env.PI_WORKDIR || env.HOME || homeDir || '').trim() || homeDir

  return {
    shell,
    args: args.length ? args : ['-l'],
    cwd,
    env: {
      ...env,
      COLORTERM: 'truecolor',
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'pi-voice-terminal'
    }
  }
}

function splitArgs(rawArgs) {
  if (!rawArgs.trim()) {
    return []
  }

  const matches = rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  return matches.map((entry) => entry.replace(/^"(.*)"$/, '$1'))
}

module.exports = {
  TerminalSession,
  resolveShellLaunchConfig,
  splitArgs
}
