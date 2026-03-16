import argparse
import base64
import json
import sys
import wave

from vosk import KaldiRecognizer, Model


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--language", default="en")
    return parser.parse_args()


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def extract_text(result_json, key="text"):
    try:
        payload = json.loads(result_json or "{}")
    except Exception:
        return ""

    return str(payload.get(key) or "").strip()


def create_recognizer(model):
    recognizer = KaldiRecognizer(model, 16000)
    recognizer.SetWords(False)
    return recognizer


def transcribe_wave_file(model, wav_path):
    recognizer = create_recognizer(model)
    final_parts = []

    with wave.open(wav_path, "rb") as wav_file:
        while True:
            chunk = wav_file.readframes(4000)
            if not chunk:
                break

            if recognizer.AcceptWaveform(chunk):
                text = extract_text(recognizer.Result())
                if text:
                    final_parts.append(text)

    final_text = extract_text(recognizer.FinalResult())
    if final_text:
        final_parts.append(final_text)

    return " ".join(part for part in final_parts if part).strip()


def main():
    args = parse_args()
    model = Model(args.model_path)
    sessions = {}

    emit({
        "type": "status",
        "state": "ready",
        "message": "Local Vosk worker is ready."
    })

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            command = json.loads(line)
            command_type = command.get("type")

            if command_type == "start_session":
                session_id = command["sessionId"]
                sessions[session_id] = create_recognizer(model)
                emit({
                    "type": "status",
                    "sessionId": session_id,
                    "state": "started",
                    "message": "Live STT session started."
                })
                continue

            if command_type == "audio_chunk":
                session_id = command["sessionId"]
                recognizer = sessions.get(session_id)
                if recognizer is None:
                    emit({
                        "type": "error",
                        "sessionId": session_id,
                        "message": "Unknown live STT session."
                    })
                    continue

                audio_bytes = base64.b64decode(command.get("audioBase64", ""))
                if recognizer.AcceptWaveform(audio_bytes):
                    text = extract_text(recognizer.Result())
                    if text:
                        emit({
                            "type": "final",
                            "sessionId": session_id,
                            "text": text
                        })
                else:
                    partial_text = extract_text(recognizer.PartialResult(), key="partial")
                    emit({
                        "type": "partial",
                        "sessionId": session_id,
                        "text": partial_text
                    })
                continue

            if command_type == "stop_session":
                session_id = command["sessionId"]
                recognizer = sessions.pop(session_id, None)
                if recognizer is not None:
                    text = extract_text(recognizer.FinalResult())
                    if text:
                        emit({
                            "type": "final",
                            "sessionId": session_id,
                            "text": text
                        })

                emit({
                    "type": "session_stopped",
                    "sessionId": session_id,
                    "state": "stopped"
                })
                continue

            if command_type == "dispose_session":
                session_id = command["sessionId"]
                sessions.pop(session_id, None)
                emit({
                    "type": "session_stopped",
                    "sessionId": session_id,
                    "state": "disposed"
                })
                continue

            if command_type == "transcribe_file":
                request_id = command["requestId"]
                wav_path = command["wavPath"]
                text = transcribe_wave_file(model, wav_path)
                emit({
                    "type": "transcription_result",
                    "requestId": request_id,
                    "text": text
                })
                continue

            if command_type == "shutdown":
                break

            emit({
                "type": "error",
                "message": f"Unknown command: {command_type}"
            })
        except Exception as error:
            emit({
                "type": "error",
                "requestId": command.get("requestId") if isinstance(command, dict) else None,
                "sessionId": command.get("sessionId") if isinstance(command, dict) else None,
                "message": str(error)
            })


if __name__ == "__main__":
    main()
