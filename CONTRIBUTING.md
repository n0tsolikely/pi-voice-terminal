# Contributing

## Ground Rules

- Keep the app Linux-native.
- Do not reintroduce WSL, PowerShell, or Windows speech dependencies.
- Do not remove `node-pty`.
- Preserve the terminal-first workflow. This is not a chat shell.
- Prefer small, testable changes over broad rewrites.

## Important Files

- `main.js`
  Electron main process and IPC wiring.
- `preload.js`
  safe renderer bridge.
- `renderer.js`
  xterm UI, mic controls, reply bubbles, playback queue, runtime logging.
- `lib/terminal-session.js`
  Linux PTY-backed shell session.
- `lib/live-stt-broker.js`
  local Vosk worker bridge.
- `lib/tts-service.js`
  OpenAI and local Linux TTS fallback ordering.
- `lib/speech-relay.js`
  assistant reply replay queue.

## Local Development

```bash
npm install
npm run doctor
npm test
```

For a Pi-style setup:

```bash
npm run setup:raspi
```

Run the app:

```bash
npm run run
```

## Verification

Before merging runtime-facing changes, run the checks that apply:

```bash
npm test
npm run verify:shell
npm run verify:app
npm run verify:modes
```

When audio code changes, also run:

```bash
npm run verify:mic
npm run verify:tts
```

## Debugging Workflow

Start with:

```bash
npm run doctor
```

Then inspect:

- `../pi-voice-terminal-runtime/latest.jsonl`
- `pty.*`
- `stt.*`
- `speech.*`
- `dictation.*`
- `mic.*`
- `ui.*`

For the full event map, see [docs/runtime-events.md](docs/runtime-events.md).

## Change Guidance

- If you touch the PTY backend, keep Linux shell behavior interactive and test resize/output flow.
- If you touch STT or TTS, keep the provider contract narrow and update `.env.example` when config changes.
- If you touch setup or update flow, keep the shell scripts conservative and Pi-friendly.
- If you touch runtime logging, document any new event families in [docs/runtime-events.md](docs/runtime-events.md).
