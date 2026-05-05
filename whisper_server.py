import sys
import os
import tempfile
import subprocess
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
PORT  = int(os.environ.get("WHISPER_PORT", "8765"))

print(f"Carico modello {MODEL}...", flush=True)
try:
    model = WhisperModel(MODEL, device="cuda", compute_type="float16")
    print("Modello su CUDA", flush=True)
except Exception:
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    print("Modello su CPU", flush=True)

lock = threading.Lock()

def transcribe(audio_path: str) -> dict:
    wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    wav_tmp.close()
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", wav_tmp.name],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        with lock:
            segments, _ = model.transcribe(
                wav_tmp.name,
                language="it",
                beam_size=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                repetition_penalty=1.2,
            )
            segs = list(segments)
        testo = " ".join(s.text.strip() for s in segs)
        timestamps = [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in segs]
        return {"ok": True, "testo": testo, "segments": timestamps}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        os.unlink(wav_tmp.name)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        result = transcribe(body["path"])
        data = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

print(f"Whisper server pronto su http://127.0.0.1:{PORT}", flush=True)
HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
