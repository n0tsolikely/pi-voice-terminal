#!/usr/bin/env node

const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const repoRoot = path.join(__dirname, '..')

function commandExists(name) {
  const result = spawnSync('bash', ['-lc', `command -v '${String(name).replace(/'/g, `'\\''`)}'`], {
    encoding: 'utf8'
  })

  return result.status === 0
}

async function main() {
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  const useXvfb = !hasDisplay

  if (useXvfb && !commandExists('xvfb-run')) {
    throw new Error(
      'No DISPLAY is available and xvfb-run is not installed. Run this from a desktop session or install xvfb.'
    )
  }

  const child = spawn(
    useXvfb ? 'xvfb-run' : 'npm',
    useXvfb ? ['-a', 'npm', 'start'] : ['start'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PI_VOICE_TERMINAL_SMOKE_TEST: '1',
        PI_VOICE_TERMINAL_SKIP_UPDATE_CHECK: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )

  let stderr = ''

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
    process.stderr.write(chunk)
  })

  const exitCode = await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Timed out waiting for Electron to finish the smoke startup check.'))
    }, 30000)

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      reject(error)
    })

    child.on('exit', (code) => {
      clearTimeout(timeoutId)
      resolve(code ?? 1)
    })
  })

  if (exitCode !== 0) {
    throw new Error(`Electron smoke startup failed with exit code ${exitCode}. ${stderr}`.trim())
  }

  process.stdout.write('App smoke startup succeeded.\n')
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
