const fs = require('node:fs')
const path = require('node:path')

function loadDotEnv(dotEnvPath, { env = process.env, override = false } = {}) {
  if (!fs.existsSync(dotEnvPath)) {
    return env
  }

  const raw = fs.readFileSync(dotEnvPath, 'utf8')

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()

    if (!key || (!override && env[key])) {
      continue
    }

    let value = trimmed.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function resolveAppPath(baseDir, value, fallbackPath = '') {
  const normalized = String(value || '').trim()

  if (!normalized) {
    return fallbackPath
  }

  return path.isAbsolute(normalized) ? normalized : path.join(baseDir, normalized)
}

module.exports = {
  loadDotEnv,
  resolveAppPath
}
