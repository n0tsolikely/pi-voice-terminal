# Runtime Events

Runtime logs are written to:

- `../pi-voice-terminal-runtime/latest.jsonl`

Use this file when behavior and assumptions diverge.

## Core Event Families

### PTY / Shell

- `pty.start`
- `pty.input`
- `pty.output`
- `pty.resize`
- `pty.exit`
- `pty.dispose`

These are the source of truth for what actually hit the shell.

### STT

- `stt.request`
- `stt.success`
- `stt.error`
- `stt.status`
- `stt.live_started`
- `stt.live_stopping`
- `stt.live_disposed`
- `stt.live_error`
- `stt.live_status`
- `stt.live_partial`
- `stt.live_final`
- `stt.live_worker_stderr`
- `stt.live_worker_exit`
- `stt.live_worker_parse_error`

Use these to separate:

- local Vosk runtime problems
- provider selection problems
- batch transcription failures
- live interim dictation failures

### Mic / Dictation

- `mic.intent`
- `mic.recording_started`
- `mic.recording_stopping`
- `mic.mode_changed`
- `mic.auto_enabled`
- `mic.auto_disabled`
- `dictation.live_started`
- `dictation.live_result`
- `dictation.live_error`
- `dictation.live_disabled`
- `dictation.live_ended`
- `dictation.auto_capture_rejected`
- `dictation.live_auto_rejected`
- `dictation.live_auto_injected`

Use these to debug `PTT`, `Click`, `Auto`, noise gating, and injection behavior.

### Reply Replay / TTS

- `speech.finalized`
- `speech.audio`
- `speech.audio_skipped`
- `speech.fallback`
- `speech.playback_started`
- `speech.playback_finished`
- `speech.playback_queue_drained`
- `speech.auto_reply_toggled`

These show which reply was spoken, by which provider, and whether playback actually happened.

### Reply Extraction

- `speech.analysis`
- `speech.analysis_rejected`
- `speech.analysis_finalized`

These are the important events when the wrong terminal text was spoken or a real answer was missed.

### UI / App

- `ui.status`
- `ui.vaporize`
- `ui.vaporize_result`
- `app.ready`
- `app.status`
- `app.smoke_test_ready`
- `app.update_check`
- `app.update_check_failed`
- `app.update_prompt_shown`
- `app.update_prompt_dismissed`
- `app.update_apply_started`
- `app.update_apply_ready`
- `app.update_apply_failed`

## Debugging Recipes

### The shell started but behaved weirdly

Inspect:

- `pty.start`
- `pty.output`
- `pty.resize`
- `pty.exit`

### Live dictation stopped working

Inspect:

- `stt.live_started`
- `stt.live_status`
- `stt.live_partial`
- `stt.live_final`
- `stt.live_error`
- `dictation.live_error`

### The app fell back to a different speech provider

Inspect:

- `stt.request`
- `stt.success`
- `speech.fallback`
- `speech.audio`

### The wrong reply was spoken

Inspect:

- `pty.output`
- `speech.analysis`
- `speech.analysis_rejected`
- `speech.finalized`

### Mode switching looked wrong

Inspect:

- `mic.mode_changed`
- `mic.auto_enabled`
- `mic.auto_disabled`
- `dictation.live_auto_injected`

## Practical Rule

Trust the JSONL receipts over guesses.
