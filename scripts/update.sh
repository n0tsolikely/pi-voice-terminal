#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_LAUNCH=0

if [[ "${1:-}" == "--no-launch" ]]; then
  NO_LAUNCH=1
fi

cd "$ROOT_DIR"

if [[ -d .git ]]; then
  git pull --ff-only
fi

npm install

if ! node scripts/check-node-pty.js --quiet; then
  npm run rebuild:native
fi

if [[ "$NO_LAUNCH" -eq 0 ]]; then
  npm start
fi
