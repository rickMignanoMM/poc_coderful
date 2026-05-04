import sys
import subprocess
import tempfile
import os
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

MODEL = "large-v3-turbo"
SAMPLE_RATE = 16000


def converti_in_wav(percorso_audio: str, output_path: str):
    subprocess.run(
        ["ffmpeg", "-y", "-i", percorso_audio, "-ar", str(SAMPLE_RATE), "-ac", "1", output_path],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def riduci_rumore(audio: np.ndarray, sr: int) -> np.ndarray:
    import noisereduce as nr
    return nr.reduce_noise(y=audio, sr=sr, stationary=False).astype(np.float32)


def normalizza(audio: np.ndarray) -> np.ndarray:
    peak = np.abs(audio).max()
    return (audio / peak * 0.95) if peak > 0 else audio


def preprocessa(wav_path: str) -> str:
    audio, sr = sf.read(wav_path)
    audio = audio.astype(np.float32)

    print("  → Riduzione rumore...", flush=True)
    audio = riduci_rumore(audio, sr)

    print("  → Normalizzazione volume...", flush=True)
    audio = normalizza(audio)

    tmp = tempfile.NamedTemporaryFile(suffix="_clean.wav", delete=False)
    tmp.close()
    sf.write(tmp.name, audio, sr)
    return tmp.name


def carica_modello():
    # CTranslate2 usa CUDA nativo senza dipendenze aggiuntive
    try:
        model = WhisperModel(MODEL, device="cuda", compute_type="float16")
        print("  → Modello caricato su CUDA", flush=True)
    except Exception:
        model = WhisperModel(MODEL, device="cpu", compute_type="int8")
        print("  → Modello caricato su CPU", flush=True)
    return model


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python trascrivi.py <percorso_audio>")
        sys.exit(1)

    audio = sys.argv[1]
    print(f"Carico il modello {MODEL}...", flush=True)
    model = carica_modello()

    print(f"\nPreprocesso: {audio}", flush=True)
    wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    wav_tmp.close()
    converti_in_wav(audio, wav_tmp.name)

    clean_wav = preprocessa(wav_tmp.name)
    os.unlink(wav_tmp.name)

    try:
        print("\nTrascrivo...", flush=True)
        segments, info = model.transcribe(
            clean_wav,
            language="it",
            beam_size=5,
            vad_filter=True,          # VAD integrato in faster-whisper
            vad_parameters={"min_silence_duration_ms": 600},
            repetition_penalty=1.3,
            no_repeat_ngram_size=7,
        )
        segmenti_lista = list(segments)
    finally:
        os.unlink(clean_wav)

    testo_completo = " ".join(s.text.strip() for s in segmenti_lista)

    print("\n--- TESTO COMPLETO ---")
    print(testo_completo)

    print("\n--- SEGMENTI CON TIMESTAMP ---")
    righe = []
    for seg in segmenti_lista:
        riga = f"[{seg.start:.1f}s - {seg.end:.1f}s]  {seg.text.strip()}"
        print(riga)
        righe.append(riga)

    base = os.path.splitext(audio)[0]
    with open(f"{base}_testo.txt", "w", encoding="utf-8") as f:
        f.write(testo_completo)
    with open(f"{base}_timestamp.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(righe))
    print(f"\nSalvato: {base}_testo.txt")
    print(f"Salvato: {base}_timestamp.txt")
