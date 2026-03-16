# Architecture

## Purpose

Pi Voice Terminal is a Raspberry Pi native Electron terminal wrapper with:

- a real `node-pty` shell session
- microphone-driven dictation
- live and batch STT
- assistant reply replay and readback
- JSONL runtime logs for debugging

The product goal is parity with `wsl-voice-terminal` without any Windows runtime dependency.

## Entry Points

- `main.js`
  Starts Electron, owns IPC, creates the PTY shell session, wires STT/TTS services, handles updates, and writes runtime logs.
- `preload.js`
  Exposes the renderer-safe IPC contract.
- `renderer.js`
  Owns xterm, microphone modes, replay history, playback queueing, and UI logging.
- `index.html`
  Static shell for the desktop UI.

## Core Runtime Modules

- `lib/terminal-session.js`
  Creates the Linux login-shell PTY and forwards terminal IO.
- `lib/live-stt-broker.js`
  Starts and talks to the Python Vosk sidecar for live partials, finals, and batch transcription.
- `scripts/vosk_worker.py`
  Local Vosk worker process used by the broker.
- `lib/openai-audio-client.js`
  OpenAI speech client for remote STT and TTS.
- `lib/piper-tts-client.js`
  Local Piper adapter.
- `lib/espeak-ng-tts-client.js`
  Local espeak-ng adapter.
- `lib/tts-service.js`
  Provider selection and fallback ordering for reply readback.
- `lib/speech-relay.js`
  Converts finalized assistant text into replayable UI/audio events.
- `lib/codex-speech-interceptor.js`
  Detects reply boundaries in PTY output.
- `lib/terminal-speech.js`
  Drops prompt chrome, tool chatter, and shell noise before speech replay.
- `lib/dev-dictionary.js`
  Applies spoken-programming corrections before prompt injection.
- `lib/runtime-logger.js`
  Writes session and latest JSONL logs.

## Runtime Flow

1. `renderer.js` boots the UI and requests PTY startup.
2. `main.js` creates `TerminalSession`.
3. `TerminalSession` launches the configured Linux shell through `node-pty`.
4. The renderer captures microphone audio.
5. Live PCM chunks go to `lib/live-stt-broker.js` when local Vosk is available.
6. One-shot recordings go to Vosk or OpenAI depending on provider selection.
7. Finalized text is normalized through the dictation buffer and injected into the PTY.
8. PTY output is observed by `lib/speech-relay.js` through `lib/codex-speech-interceptor.js`.
9. Reply text and optional replay audio are sent back to the renderer as `speech:*` events.

## Provider Policy

### STT

- `auto`: local Vosk first, then OpenAI batch transcription if a valid key exists
- `local`: Vosk only
- `openai`: OpenAI batch only, no live interim dictation

### TTS

- `auto`: OpenAI, then Piper, then espeak-ng
- `local`: Piper, then espeak-ng
- explicit `piper`, `espeak`, or `openai` stays pinned to that provider

## Filesystem Layout

- repo root
  app code, tests, setup scripts, docs
- `.local-stt/`
  downloaded Vosk models
- `.local-stt-venv/`
  Python runtime for local Vosk
- `../pi-voice-terminal-runtime/`
  JSONL runtime logs

## Verification Surface

- `scripts/doctor.js`
  dependency and environment diagnostics
- `scripts/verify-shell.js`
  PTY launch and resize check
- `scripts/verify-mic.js`
  microphone capture and STT verification
- `scripts/verify-tts.js`
  TTS synthesis and playback verification
- `scripts/verify-app.js`
  Electron smoke startup
- `scripts/verify-modes.js`
  mode-state transitions and runtime log receipts
