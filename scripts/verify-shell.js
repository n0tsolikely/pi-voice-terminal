#!/usr/bin/env node

const os = require('node:os')
const assert = require('node:assert/strict')
const pty = require('node-pty')

const { resolveShellLaunchConfig } = require('../lib/terminal-session')

const SENTINEL = '__PI_VOICE_TERMINAL_SHELL_OK__'

async function main() {
  const launch = resolveShellLaunchConfig({
    env: process.env,
    homeDir: os.homedir()
  })

  const shell = pty.spawn(launch.shell, launch.args, {
    cols: 80,
    rows: 24,
    cwd: launch.cwd,
    env: launch.env,
    name: 'xterm-256color'
  })

  let output = ''
  let commandsSent = false

  const sendCommands = () => {
    if (commandsSent) {
      return
    }

    commandsSent = true
    shell.resize(100, 30)
    shell.write(`printf '${SENTINEL}\\n'\r`)
    shell.write('stty size\r')
    shell.write('exit\r')
  }

  const exitCode = await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      shell.kill()
      reject(new Error('Timed out waiting for the PTY verification shell to respond.'))
    }, 15000)

    shell.onData((chunk) => {
      output += chunk

      if (!commandsSent) {
        sendCommands()
      }
    })

    shell.onExit((event) => {
      clearTimeout(timeoutId)
      resolve(event.exitCode)
    })

    setTimeout(sendCommands, 600)
  })

  assert.match(output, new RegExp(SENTINEL))
  assert.match(output, /\b30 100\b/)
  assert.equal(exitCode, 0)

  process.stdout.write(`Shell verification succeeded with ${launch.shell}.\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
