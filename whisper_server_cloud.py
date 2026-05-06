import os
import tempfile
import subprocess
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
PORT  = int(os.environ.get("WHISPER_PORT", "8765"))
HF_HOME = os.environ.get("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "it")

print(f"Carico modello {MODEL}...", flush=True)
print(f"Cache Hugging Face: {HF_HOME}", flush=True)
CPU_THREADS = int(os.environ.get("WHISPER_THREADS", str(min(os.cpu_count() or 4, 8))))
lock = threading.Lock()


def resolve_backend(model_name: str) -> tuple[str, str]:
    aliases = {
        "large-v3-turbo": "openai/whisper-large-v3-turbo",
        "whisper-large-v3-turbo": "openai/whisper-large-v3-turbo",
    }
    resolved_model = aliases.get(model_name, model_name)
    if resolved_model.startswith("openai/whisper-"):
        return "transformers", resolved_model
    return "faster-whisper", resolved_model


def load_faster_whisper_backend(model_name: str):
    from faster_whisper import WhisperModel

    print(f"Uso backend faster-whisper per {model_name}", flush=True)
    try:
        print(f"Tento caricamento CUDA per {model_name} (float16)...", flush=True)
        model = WhisperModel(model_name, device="cuda", compute_type="float16")
        print("Modello su CUDA", flush=True)
    except Exception as exc:
        print(f"CUDA non disponibile o load fallito: {exc}", flush=True)
        print(f"Tento fallback CPU ({CPU_THREADS} thread, int8)...", flush=True)
        model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=CPU_THREADS)
        print(f"Modello su CPU ({CPU_THREADS} thread)", flush=True)

    def transcribe_impl(audio_path: str) -> dict:
        with lock:
            segments, _ = model.transcribe(
                audio_path,
                language=LANGUAGE,
                beam_size=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                repetition_penalty=1.2,
            )
            segs = list(segments)

        testo = " ".join(segment.text.strip() for segment in segs)
        timestamps = [{"start": segment.start, "end": segment.end, "text": segment.text.strip()} for segment in segs]
        return {"ok": True, "testo": testo, "segments": timestamps}

    return transcribe_impl


def load_transformers_backend(model_name: str):
    import torch
    from huggingface_hub import snapshot_download
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

    device_name = "cuda:0" if torch.cuda.is_available() else "cpu"
    pipeline_device = 0 if torch.cuda.is_available() else -1
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    print(f"Uso backend transformers per {model_name}", flush=True)
    print(f"Scarico/sincronizzo modello da Hugging Face: {model_name}", flush=True)
    model_path = snapshot_download(
        repo_id=model_name,
        allow_patterns=["*.json", "*.txt", "*.model", "*.tiktoken", "*.safetensors"],
    )
    print(f"Modello disponibile in cache: {model_path}", flush=True)
    print(f"Tento caricamento {device_name} per {model_name} ({torch_dtype})...", flush=True)

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        model_path,
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
    )
    model.to(device_name)
    processor = AutoProcessor.from_pretrained(model_path)
    asr_pipeline = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=torch_dtype,
        device=pipeline_device,
        chunk_length_s=30,
        batch_size=8,
    )

    if torch.cuda.is_available():
        print("Modello su CUDA", flush=True)
    else:
        print("Modello su CPU", flush=True)

    def transcribe_impl(audio_path: str) -> dict:
        with lock:
            result = asr_pipeline(
                audio_path,
                return_timestamps=True,
                generate_kwargs={"language": LANGUAGE, "task": "transcribe"},
            )

        chunks = result.get("chunks") or []
        timestamps = []
        for chunk in chunks:
            start, end = chunk.get("timestamp", (None, None))
            timestamps.append(
                {
                    "start": 0.0 if start is None else start,
                    "end": 0.0 if end is None else end,
                    "text": chunk.get("text", "").strip(),
                }
            )

        return {
            "ok": True,
            "testo": result.get("text", "").strip(),
            "segments": timestamps,
        }

    return transcribe_impl


BACKEND, RESOLVED_MODEL = resolve_backend(MODEL)
if BACKEND == "transformers":
    transcribe_backend = load_transformers_backend(RESOLVED_MODEL)
else:
    transcribe_backend = load_faster_whisper_backend(RESOLVED_MODEL)

def transcribe(audio_path: str) -> dict:
    wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    wav_tmp.close()
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", wav_tmp.name],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return transcribe_backend(wav_tmp.name)
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
    allow_reuse_address = True

try:
    server = ThreadedHTTPServer(("127.0.0.1", PORT), Handler)
except OSError as exc:
    print(f"ERRORE: impossibile avviare Whisper server su http://127.0.0.1:{PORT}: {exc}", flush=True)
    raise

print(f"Whisper server pronto su http://127.0.0.1:{PORT}", flush=True)
server.serve_forever()
