#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { loadDotEnv, resolveAppPath } = require('../lib/app-env')

const repoRoot = path.join(__dirname, '..')
const envPath = path.join(repoRoot, '.env')
const pkgPath = path.join(repoRoot, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

loadDotEnv(envPath)

const runtimeDir = path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-runtime`)
const latestRuntimeLog = path.join(runtimeDir, 'latest.jsonl')
const defaultModelPath = path.join(repoRoot, '.local-stt', 'models', 'vosk-model-small-en-us-0.15')
const configuredModelPath = resolveAppPath(repoRoot, process.env.VOSK_MODEL_PATH, defaultModelPath)
const configuredPythonPath = resolveAppPath(
  repoRoot,
  process.env.LOCAL_STT_PYTHON,
  path.join(repoRoot, '.local-stt-venv', 'bin', 'python')
)
const configuredPiperModel = resolveAppPath(repoRoot, process.env.PIPER_VOICE_MODEL, '')
const configuredPiperBin = String(process.env.PIPER_BIN || 'piper').trim() || 'piper'
const configuredEspeakVoice = String(process.env.ESPEAK_VOICE || 'en-us').trim() || 'en-us'

let warnCount = 0
let failCount = 0

function run(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8'
    },
    encoding: 'utf8'
  })

  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    status: result.status,
    error: result.error || null
  }
}

function commandExists(name) {
  return run('bash', ['-lc', `command -v ${shellQuote(name)}`]).ok
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function log(level, message) {
  process.stdout.write(`[${level}] ${message}\n`)
}

function ok(message) {
  log('OK', message)
}

function warn(message) {
  warnCount += 1
  log('WARN', message)
}

function fail(message) {
  failCount += 1
  log('FAIL', message)
}

function isPlaceholderKey(value) {
  if (!value) {
    return true
  }

  const lowered = String(value).toLowerCase()
  return (
    lowered.includes('your_key_here') ||
    lowered.includes('replace_me') ||
    lowered.includes('changeme')
  )
}

ok(`Repo detected: ${repoRoot}`)
ok(`Package detected: ${pkg.name}@${pkg.version}`)

if (process.platform === 'linux') {
  ok(`Platform detected: ${process.platform}`)
} else {
  fail(`Platform detected: ${process.platform}. Pi Voice Terminal must run on Linux.`)
}

if (process.arch === 'arm64') {
  ok(`Architecture detected: ${process.arch}`)
} else {
  warn(`Architecture detected: ${process.arch}. Raspberry Pi OS / Debian arm64 is the supported baseline.`)
}

ok(`Node detected: ${process.version}`)

const npmVersion = run('npm', ['-v'])
if (npmVersion.ok) {
  ok(`npm detected: ${npmVersion.stdout}`)
} else {
  fail('npm not found on PATH')
}

const gitVersion = run('git', ['--version'])
if (gitVersion.ok) {
  ok(gitVersion.stdout)
} else {
  fail('git not found on PATH')
}

const pythonVersion = run('python3', ['--version'])
if (pythonVersion.ok) {
  ok(`Python detected: ${pythonVersion.stdout}`)
} else {
  fail('python3 not found on PATH')
}

if (fs.existsSync(envPath)) {
  ok(`.env detected: ${envPath}`)
} else {
  warn('.env is missing. Copy .env.example or run npm run setup:raspi.')
}

const apiKey = process.env.OPENAI_API_KEY || ''
if (apiKey && !isPlaceholderKey(apiKey)) {
  ok('OPENAI_API_KEY is configured')
} else {
  warn('OPENAI_API_KEY is missing or still a placeholder. Remote OpenAI STT/TTS will be unavailable.')
}

if (fs.existsSync(path.join(repoRoot, 'requirements.local-stt.txt'))) {
  ok('Local Vosk requirements file is present')
} else {
  fail('requirements.local-stt.txt is missing')
}

if (fs.existsSync(configuredPythonPath)) {
  ok(`Local STT virtualenv python detected: ${configuredPythonPath}`)
} else {
  warn(`Local STT virtualenv python not found at ${configuredPythonPath}`)
}

if (fs.existsSync(configuredModelPath)) {
  ok(`Vosk model detected: ${configuredModelPath}`)
} else {
  fail(`Vosk model path missing: ${configuredModelPath}`)
}

const nodePtyCheck = run('node', ['scripts/check-node-pty.js', '--quiet'])
if (nodePtyCheck.ok) {
  ok('node-pty loads successfully')
} else {
  fail(`node-pty failed to load. Run npm run rebuild:native. ${nodePtyCheck.stderr || nodePtyCheck.stdout}`.trim())
}

const ffmpegVersion = run('ffmpeg', ['-version'])
if (ffmpegVersion.ok) {
  ok(`ffmpeg detected: ${ffmpegVersion.stdout.split('\n')[0]}`)
} else {
  fail('ffmpeg not found on PATH')
}

const arecordVersion = run('arecord', ['--version'])
if (arecordVersion.ok) {
  ok(`arecord detected: ${arecordVersion.stdout.split('\n')[0]}`)
} else {
  fail('arecord not found on PATH')
}

const aplayVersion = run('aplay', ['--version'])
if (aplayVersion.ok) {
  ok(`aplay detected: ${aplayVersion.stdout.split('\n')[0]}`)
} else {
  fail('aplay not found on PATH')
}

const arecordDevices = run('arecord', ['-l'])
if (arecordDevices.ok) {
  ok('ALSA capture devices are visible')
} else {
  warn(`No ALSA capture device detected. ${arecordDevices.stderr || arecordDevices.stdout}`.trim())
}

const espeakVersion = run('espeak-ng', ['--version'])
if (espeakVersion.ok) {
  ok(`espeak-ng detected: ${espeakVersion.stdout.split('\n')[0]}`)
} else {
  fail('espeak-ng not found on PATH')
}

const piperVersion = run(configuredPiperBin, ['--help'])
if (configuredPiperModel && fs.existsSync(configuredPiperModel)) {
  if (piperVersion.ok) {
    ok(`Piper is configured with model: ${configuredPiperModel}`)
  } else {
    warn(`Piper model is configured but ${configuredPiperBin} is unavailable`)
  }
} else if (piperVersion.ok) {
  warn('Piper is installed but PIPER_VOICE_MODEL is not configured. Local TTS will use espeak-ng unless you set a Piper voice.')
} else {
  warn('Piper is not configured. This is fine if you plan to use OpenAI TTS or espeak-ng.')
}

ok(`espeak-ng voice configured: ${configuredEspeakVoice}`)

const pactlInfo = run('pactl', ['info'])
if (pactlInfo.ok) {
  ok('PulseAudio / PipeWire Pulse compatibility is reachable')
} else if (commandExists('wpctl') && run('wpctl', ['status']).ok) {
  ok('PipeWire is reachable via wpctl')
} else {
  warn('Neither pactl nor wpctl reported a working audio session. Playback/capture may fail outside a desktop session.')
}

if (pkg.scripts?.['setup:raspi']) {
  ok('setup:raspi script is defined')
} else {
  fail('setup:raspi script is missing from package.json')
}

if (pkg.scripts?.['package:arm64']) {
  ok('package:arm64 script is defined')
} else {
  fail('package:arm64 script is missing from package.json')
}

if (fs.existsSync(latestRuntimeLog)) {
  ok(`Latest runtime log detected: ${latestRuntimeLog}`)
} else {
  warn(`No runtime log has been written yet: ${latestRuntimeLog}`)
}

log('INFO', `Warnings: ${warnCount}`)
log('INFO', `Failures: ${failCount}`)

process.exitCode = failCount > 0 ? 1 : 0
