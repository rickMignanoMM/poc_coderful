<<<<<<< Updated upstream
import sys
import os
import tempfile
import subprocess
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
PORT  = int(os.environ.get("WHISPER_PORT", "8765"))

print(f"Carico modello {MODEL}...", flush=True)
CPU_THREADS = int(os.environ.get("WHISPER_THREADS", str(min(os.cpu_count() or 4, 8))))

try:
    model = WhisperModel(MODEL, device="cuda", compute_type="float16")
    print("Modello su CUDA", flush=True)
except Exception:
    model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=CPU_THREADS)
    print(f"Modello su CPU ({CPU_THREADS} thread)", flush=True)

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

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

print(f"Whisper server pronto su http://127.0.0.1:{PORT}", flush=True)
ThreadedHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
=======
import os
import sys
import tempfile
import subprocess
import threading
import numpy as np
import soundfile as sf
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
PORT  = int(os.environ.get("WHISPER_PORT", 8765))

app = Flask(__name__)
model = None
model_lock = threading.Lock()


def load_model():
    global model
    try:
        model = WhisperModel(MODEL, device="cuda", compute_type="float16")
        print(f"Whisper {MODEL} caricato su CUDA", flush=True)
    except Exception:
        model = WhisperModel(MODEL, device="cpu", compute_type="int8")
        print(f"Whisper {MODEL} caricato su CPU", flush=True)


def convert_to_wav(src: str, dst: str):
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-ar", "16000", "-ac", "1", dst],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def preprocess(wav_path: str) -> str:
    import noisereduce as nr
    audio, sr = sf.read(wav_path)
    audio = audio.astype(np.float32)
    audio = nr.reduce_noise(y=audio, sr=sr, stationary=False).astype(np.float32)
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak * 0.95
    tmp = tempfile.NamedTemporaryFile(suffix="_clean.wav", delete=False)
    tmp.close()
    sf.write(tmp.name, audio, sr)
    return tmp.name


@app.get("/")
def health():
    return jsonify({"status": "ok", "model": MODEL})


@app.post("/transcribe")
def transcribe():
    data = request.get_json(silent=True) or {}
    src_path = data.get("path")
    if not src_path or not os.path.exists(src_path):
        return jsonify({"error": "Path audio mancante o non trovato"}), 400

    wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    wav_tmp.close()
    clean_wav = None

    try:
        convert_to_wav(src_path, wav_tmp.name)
        clean_wav = preprocess(wav_tmp.name)

        with model_lock:
            segments, _ = model.transcribe(
                clean_wav,
                language="it",
                beam_size=5,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 600},
                repetition_penalty=1.3,
                no_repeat_ngram_size=7,
            )
            segs = list(segments)

        testo = " ".join(s.text.strip() for s in segs)
        return jsonify({"testo": testo})
    finally:
        try: os.unlink(wav_tmp.name)
        except: pass
        if clean_wav:
            try: os.unlink(clean_wav)
            except: pass


if __name__ == "__main__":
    print(f"Carico modello Whisper {MODEL}...", flush=True)
    load_model()
    print(f"Whisper server in ascolto su :{PORT}", flush=True)
    app.run(host="0.0.0.0", port=PORT, threaded=False)
>>>>>>> Stashed changes
