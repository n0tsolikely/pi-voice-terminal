# Pi Voice Terminal

`pi-voice-terminal` is a Raspberry Pi native port of `wsl-voice-terminal`.

It keeps the same product shape:

- Electron desktop shell
- real PTY-backed terminal
- three microphone modes: `PTT`, `Click`, `Auto`
- assistant reply bubbles with replay/readback
- JSONL runtime logs for debugging

It does not depend on WSL, `wsl.exe`, PowerShell, or Windows speech APIs.

## How It Differs From `wsl-voice-terminal`

- The terminal backend launches a native Linux login shell through `node-pty`.
- Live and batch local STT use a Python Vosk sidecar instead of Windows speech paths.
- Local TTS uses `piper` or `espeak-ng` instead of `System.Speech`.
- Setup, doctor, update, and verification flows are Linux-first and Pi-friendly.
- Runtime logs now describe the Raspberry Pi app path, not a mirrored Windows install.

## Platform Baseline

- Raspberry Pi OS or Debian Linux
- `arm64` is the supported baseline
- a desktop session is recommended for normal Electron use
- `x64` development works, but the target product is Raspberry Pi

## Prerequisites

- `git`
- `node` and `npm`
- `python3` with `venv`
- ALSA capture/playback tools: `arecord`, `aplay`
- `ffmpeg`
- `espeak-ng`
- PulseAudio or PipeWire session support is recommended for desktop microphone access

`npm run setup:raspi` installs the system packages this repo expects and provisions the local Vosk runtime.

## Install

```bash
git clone git@github.com:n0tsolikely/pi-voice-terminal.git
cd pi-voice-terminal
npm run setup:raspi
npm run run
```

If you prefer manual setup:

```bash
npm install
cp .env.example .env
python3 -m venv .local-stt-venv
.local-stt-venv/bin/pip install -r requirements.local-stt.txt
mkdir -p .local-stt/models
# download and extract a Vosk model into .local-stt/models/
npm run rebuild:native
```

Then set `VOSK_MODEL_PATH` and `LOCAL_STT_PYTHON` in `.env`, or just run `npm run setup:raspi` once and let the script wire those values for you.

## Audio Stack

- Microphone capture verification uses ALSA (`arecord`)
- Local playback verification uses ALSA (`aplay`)
- Electron microphone capture relies on the active Linux desktop audio session
- Local TTS fallback order is:
  - `piper` when `PIPER_VOICE_MODEL` is configured
  - `espeak-ng` otherwise

`piper` is optional. The setup script does not bundle a model for you.

## Configuration

Copy `.env.example` to `.env` and adjust only what you need.

Important keys:

- `PI_SHELL`, `PI_SHELL_ARGS`, `PI_WORKDIR`
- `STT_PROVIDER=auto|local|openai`
- `VOSK_MODEL_PATH`
- `LOCAL_STT_LANGUAGE`
- `LOCAL_STT_PYTHON`
- `TTS_PROVIDER=auto|openai|piper|espeak|local`
- `PIPER_BIN`
- `PIPER_VOICE_MODEL`
- `ESPEAK_VOICE`
- `OPENAI_API_KEY`

Provider behavior:

- `STT_PROVIDER=auto` prefers local Vosk and falls back to OpenAI batch transcription when a valid key exists
- `STT_PROVIDER=openai` keeps batch transcription only; live interim dictation is unavailable there
- `TTS_PROVIDER=auto` prefers OpenAI when configured, then `piper`, then `espeak-ng`
- `TTS_PROVIDER=local` stays on local Linux voices only

## Run

```bash
npm run run
```

The in-app update prompt uses `scripts/update.sh`, which does:

```bash
git pull --ff-only
npm install
npm run rebuild:native
```

## Test And Verify

Unit tests:

```bash
npm test
```

Environment diagnostics:

```bash
npm run doctor
```

Verification commands:

```bash
npm run verify:shell
npm run verify:mic
npm run verify:tts
npm run verify:app
npm run verify:modes
```

What they check:

- `verify:shell`: PTY shell launch, output, and resize behavior
- `verify:mic`: default microphone capture plus STT receipts
- `verify:tts`: synthesis and local playback with the active TTS provider
- `verify:app`: Electron window and PTY smoke startup
- `verify:modes`: mode-state transitions plus matching runtime log entries

Package the app for Linux arm64:

```bash
npm run package:arm64
```

## Runtime Logs

Logs are written outside the repo in a sibling runtime directory:

```text
../pi-voice-terminal-runtime/latest.jsonl
```

Useful event families:

- `pty.*`
- `stt.*`
- `stt.live_*`
- `speech.*`
- `dictation.*`
- `mic.*`
- `ui.*`
- `app.update_*`

See [docs/runtime-events.md](docs/runtime-events.md).

## Architecture Overview

- `main.js`
  Electron main process, PTY startup, STT/TTS wiring, updater, runtime logging
- `preload.js`
  Narrow IPC bridge between Electron and the renderer
- `renderer.js`
  xterm surface, mic controls, mode transitions, reply history, playback queue
- `lib/terminal-session.js`
  Linux shell PTY backend
- `lib/live-stt-broker.js`
  Python Vosk worker lifecycle and live/batch transcription bridge
- `lib/tts-service.js`
  TTS provider selection and fallback ordering
- `lib/speech-relay.js`
  assistant reply extraction to replayable speech/audio events

More detail lives in [docs/architecture.md](docs/architecture.md).

## Known Limitations

- Raspberry Pi OS / Debian `arm64` is the release target; other Linux variants are best-effort.
- `piper` is supported but not bundled. You must provide the binary and model yourself.
- OpenAI STT does not provide live interim dictation in this app; local Vosk does.
- `verify:app` may print D-Bus or GPU warnings in headless sessions even when the smoke test succeeds.
- `verify:mic` and `verify:tts` require real audio devices and ALSA tooling on the host.

## Repo Docs

- [docs/architecture.md](docs/architecture.md)
- [docs/runtime-events.md](docs/runtime-events.md)
- [docs/developer_dictionary.md](docs/developer_dictionary.md)
- [docs/hallucination_map.md](docs/hallucination_map.md)
- [docs/github_metadata.md](docs/github_metadata.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
