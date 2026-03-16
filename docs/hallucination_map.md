# Hallucination Map

This file documents wrong assumptions people or tools are likely to make about this repo.

## Common Wrong Assumptions

- `This is still a WSL wrapper.`
  False. The app launches a native Linux shell through `node-pty`.

- `This repo runs only on Windows.`
  False. The target platform is Raspberry Pi OS / Debian Linux.

- `Python powers the whole app.`
  False. The app is primarily Node/Electron. Python exists for the local Vosk worker only.

- `OpenAI is required.`
  False. Local Vosk plus local Linux TTS can run without OpenAI.

- `Piper is bundled and ready by default.`
  False. Piper is supported, but you must supply a binary and voice model.

- `Runtime logs live inside the repo.`
  False. They are written to a sibling folder named `pi-voice-terminal-runtime`.

- `Speech replay is just TTS of whatever the terminal prints.`
  False. The app tries hard to isolate assistant replies and reject tool chatter, shell prompts, and user echo.

- `node-pty` is optional.`
  False. It is the core terminal backend.

- `If OpenAI STT is configured, live interim dictation should still work.`
  False. Live interim dictation depends on the local Vosk path.

- `Reply bubbles are decorative only.`
  False. They are part of the replay/readback UX.

## Safe Interpretation Rules

- Prefer runtime receipts over guesses.
- Prefer `latest.jsonl` over memory.
- Treat Linux runtime behavior as the user-facing source of truth.
- Treat the repo code and commit history as the source of truth for implementation details.
