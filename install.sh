#!/usr/bin/env bash

set -euo pipefail

REPO_URL_HTTPS="https://github.com/n0tsolikely/pi-voice-terminal.git"
REPO_URL_SSH="git@github.com:n0tsolikely/pi-voice-terminal.git"
BRANCH="main"
REPO_DIR="${PI_VOICE_TERMINAL_DIR:-$HOME/pi-voice-terminal}"
NO_LAUNCH=0

log() {
  printf '[install] %s\n' "$1"
}

warn() {
  printf '[install] %s\n' "$1" >&2
}

fail() {
  printf '[install] %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: bash install.sh [--no-launch] [--repo-dir PATH]

Installs or updates Pi Voice Terminal into $HOME/pi-voice-terminal by default,
runs the Raspberry Pi setup flow, and launches the app unless --no-launch is set.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-launch)
      NO_LAUNCH=1
      shift
      ;;
    --repo-dir)
      if [[ $# -lt 2 ]]; then
        fail '--repo-dir requires a path.'
      fi
      REPO_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  fail 'install.sh must be run on Linux.'
fi

SUDO=""
if [[ "${EUID}" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    fail 'sudo is required for the setup flow.'
  fi
  SUDO="sudo"
fi

if ! command -v git >/dev/null 2>&1; then
  log 'git is missing. Installing the bootstrap packages first.'
  $SUDO apt-get update
  $SUDO apt-get install -y git ca-certificates
fi

if [[ -d "$REPO_DIR/.git" ]]; then
  ORIGIN_URL="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"

  if [[ "$ORIGIN_URL" != "$REPO_URL_HTTPS" && "$ORIGIN_URL" != "$REPO_URL_SSH" ]]; then
    fail "Existing repo at $REPO_DIR points to $ORIGIN_URL, not $REPO_URL_HTTPS."
  fi

  if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
    warn "Existing repo at $REPO_DIR has local changes. Skipping git pull and using it as-is."
  else
    log "Updating existing repo at $REPO_DIR"
    git -C "$REPO_DIR" fetch origin
    git -C "$REPO_DIR" checkout "$BRANCH"
    git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
  fi
elif [[ -e "$REPO_DIR" ]]; then
  fail "$REPO_DIR already exists but is not a git repo."
else
  log "Cloning $REPO_URL_HTTPS into $REPO_DIR"
  git clone --branch "$BRANCH" "$REPO_URL_HTTPS" "$REPO_DIR"
fi

cd "$REPO_DIR"

log 'Running Raspberry Pi setup.'
bash scripts/setup-raspi.sh

if [[ "$NO_LAUNCH" -eq 0 ]]; then
  log 'Launching Pi Voice Terminal.'
  npm run run
else
  log 'Install finished. Launch the app with:'
  log "cd $REPO_DIR && npm run run"
fi
