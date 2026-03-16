# Developer Dictionary

This file maps common spoken or contributor-facing terms to the modules in this repo.

## Core Project Terms

- `terminal`
  The `node-pty` backed Linux shell surface inside the Electron window.
- `voice layer`
  The microphone capture, STT, dictation cleanup, and prompt injection path.
- `response replay`
  The assistant readback system that turns finalized terminal replies into replayable audio.
- `speech relay`
  `lib/speech-relay.js`, which turns finalized assistant text into `speech:*` events.
- `speech interceptor`
  `lib/codex-speech-interceptor.js`, which decides when terminal output is complete enough to speak.
- `terminal speech extraction`
  `lib/terminal-speech.js`, which drops prompt/tool noise before replay.
- `developer dictionary`
  `lib/dev-dictionary.js`, the spoken-programming correction layer used before text injection.
- `runtime log`
  The JSONL session logs written into `../pi-voice-terminal-runtime`.
- `doctor`
  `npm run doctor`, the quick Pi/Linux dependency check.

## UI Terms

- `reply bubble`
  The replayable assistant-response card shown in the UI.
- `status bubble`
  A transient status message near the voice controls.
- `vaporize`
  The shared transient-bubble disappearance effect implemented in `lib/ui-vaporize.js`.
- `R button`
  The reply-history toggle in the UI.

## Speech Terms

- `PTT`
  Press-to-talk mode.
- `Click`
  Toggle-to-record mode. Dictation injects into the prompt and waits for Enter.
- `Auto`
  Always-listening mode with voice/noise gating.
- `OpenAI`
  Remote STT/TTS path used when the key is valid and provider policy selects it.
- `local Vosk`
  The Python Vosk runtime installed into `.local-stt-venv` and pointed at `VOSK_MODEL_PATH`.
- `Piper`
  Optional local neural TTS adapter.
- `espeak-ng`
  Local fallback TTS adapter that works without a bundled neural model.

## Tool Terms

- `Codex`
  OpenAI Codex running in the terminal.
- `Claude Code`
  Claude Code running in the terminal.
- `agent reply`
  Assistant text that should be spoken back.
- `tool chatter`
  Non-conversational terminal noise such as spinners, diffs, command traces, or footer chrome.

## Recommended Mental Model

Think in four layers:

1. Electron shell
2. PTY-backed Linux terminal session
3. Dictation and developer dictionary input path
4. Assistant response replay output path
