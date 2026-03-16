const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveShellLaunchConfig, splitArgs } = require('../lib/terminal-session')

test('resolveShellLaunchConfig prefers Pi-specific shell settings', () => {
  const config = resolveShellLaunchConfig({
    env: {
      PI_SHELL: '/usr/bin/zsh',
      PI_SHELL_ARGS: '--login -i',
      PI_WORKDIR: '/home/pi/workspace'
    },
    homeDir: '/home/pi'
  })

  assert.equal(config.shell, '/usr/bin/zsh')
  assert.deepEqual(config.args, ['--login', '-i'])
  assert.equal(config.cwd, '/home/pi/workspace')
  assert.equal(config.env.TERM, 'xterm-256color')
  assert.equal(config.env.COLORTERM, 'truecolor')
  assert.equal(config.env.TERM_PROGRAM, 'pi-voice-terminal')
})

test('resolveShellLaunchConfig falls back to the user shell and login mode', () => {
  const config = resolveShellLaunchConfig({
    env: {
      SHELL: '/bin/fish'
    },
    homeDir: '/home/pi'
  })

  assert.equal(config.shell, '/bin/fish')
  assert.deepEqual(config.args, ['-l'])
  assert.equal(config.cwd, '/home/pi')
})

test('splitArgs keeps quoted shell arguments together', () => {
  assert.deepEqual(splitArgs('--login "--rcfile=/tmp/pi voice rc"'), [
    '--login',
    '--rcfile=/tmp/pi voice rc'
  ])
})
