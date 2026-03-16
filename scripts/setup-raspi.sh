#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
MODEL_NAME="vosk-model-small-en-us-0.15"
MODEL_DIR="$ROOT_DIR/.local-stt/models"
MODEL_PATH="$MODEL_DIR/$MODEL_NAME"
VENV_DIR="$ROOT_DIR/.local-stt-venv"
VENV_PYTHON="$VENV_DIR/bin/python"

APT_PACKAGES=(
  alsa-utils
  build-essential
  ca-certificates
  curl
  espeak-ng
  ffmpeg
  git
  libasound2-dev
  libatk-bridge2.0-0
  libatk1.0-0
  libcups2
  libdrm2
  libgbm1
  libgtk-3-0
  libnotify4
  libnss3
  libx11-xcb1
  libxcomposite1
  libxdamage1
  libxfixes3
  libxkbcommon0
  libxrandr2
  libxss1
  libxtst6
  nodejs
  npm
  pkg-config
  pulseaudio-utils
  python3
  python3-pip
  python3-venv
  unzip
  xvfb
)

log() {
  printf '[setup] %s\n' "$1"
}

fail() {
  printf '[setup] %s\n' "$1" >&2
  exit 1
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

if [[ "$(uname -s)" != "Linux" ]]; then
  fail 'scripts/setup-raspi.sh must be run on Linux.'
fi

if [[ "$(uname -m)" != "aarch64" ]]; then
  log "Warning: expected Raspberry Pi OS / Debian arm64. Detected $(uname -m). Continuing anyway."
fi

SUDO=""
if [[ "${EUID}" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    fail 'sudo is required to install system packages.'
  fi
  SUDO="sudo"
fi

log 'Installing Raspberry Pi system packages...'
$SUDO apt-get update
$SUDO apt-get install -y "${APT_PACKAGES[@]}"

mkdir -p "$MODEL_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  log 'Created .env from .env.example.'
fi

if [[ ! -d "$VENV_DIR" ]]; then
  log 'Creating the local STT virtual environment...'
  python3 -m venv "$VENV_DIR"
fi

log 'Installing the local Vosk runtime...'
"$VENV_PYTHON" -m pip install --upgrade pip wheel
"$VENV_PYTHON" -m pip install -r "$ROOT_DIR/requirements.local-stt.txt"

if [[ ! -d "$MODEL_PATH" ]]; then
  log "Downloading the default Vosk model: $MODEL_NAME"
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEMP_DIR"' EXIT
  curl -L "https://alphacephei.com/vosk/models/${MODEL_NAME}.zip" -o "$TEMP_DIR/model.zip"
  unzip -q "$TEMP_DIR/model.zip" -d "$MODEL_DIR"
  rm -rf "$TEMP_DIR"
  trap - EXIT
fi

upsert_env_value "STT_PROVIDER" "auto" "$ENV_FILE"
upsert_env_value "VOSK_MODEL_PATH" ".local-stt/models/${MODEL_NAME}" "$ENV_FILE"
upsert_env_value "LOCAL_STT_LANGUAGE" "en" "$ENV_FILE"
upsert_env_value "LOCAL_STT_PYTHON" ".local-stt-venv/bin/python" "$ENV_FILE"
upsert_env_value "TTS_PROVIDER" "auto" "$ENV_FILE"
upsert_env_value "PIPER_BIN" "piper" "$ENV_FILE"
upsert_env_value "ESPEAK_VOICE" "en-us" "$ENV_FILE"

log 'Installing Node dependencies...'
cd "$ROOT_DIR"
npm install

if ! node scripts/check-node-pty.js --quiet; then
  log 'Rebuilding node-pty for the current Electron runtime...'
  npm run rebuild:native
fi

if command -v piper >/dev/null 2>&1; then
  log 'Piper is available. Configure PIPER_VOICE_MODEL in .env if you want local neural TTS.'
else
  log 'Piper is not installed. The app will use espeak-ng for local TTS until you configure Piper.'
fi

log 'Setup complete.'
log 'Run the app with: npm run run'
