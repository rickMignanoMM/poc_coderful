import sys
import subprocess
import tempfile
import os
import numpy as np
import torch
import soundfile as sf
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

MODEL = "openai/whisper-large-v3-turbo"
SAMPLE_RATE = 16000

def converti_in_wav(percorso_audio: str, output_path: str):
    subprocess.run(
        ["ffmpeg", "-y", "-i", percorso_audio, "-ar", str(SAMPLE_RATE), "-ac", "1", output_path],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

def riduci_rumore(audio: np.ndarray, sr: int) -> np.ndarray:
    import noisereduce as nr
    return nr.reduce_noise(y=audio, sr=sr, stationary=False).astype(np.float32)

def applica_vad(audio: np.ndarray, sr: int) -> np.ndarray:
    from silero_vad import load_silero_vad, get_speech_timestamps
    vad = load_silero_vad()
    tensor = torch.FloatTensor(audio)
    timestamps = get_speech_timestamps(
        tensor, vad,
        sampling_rate=sr,
        threshold=0.4,
        min_silence_duration_ms=600,
        speech_pad_ms=200,
    )
    if not timestamps:
        return audio
    return np.concatenate([audio[t["start"]:t["end"]] for t in timestamps])

def normalizza(audio: np.ndarray) -> np.ndarray:
    peak = np.abs(audio).max()
    return (audio / peak * 0.95) if peak > 0 else audio

def preprocessa(wav_path: str) -> str:
    audio, sr = sf.read(wav_path)
    audio = audio.astype(np.float32)

    print("  → Riduzione rumore...")
    audio = riduci_rumore(audio, sr)

    print("  → VAD (rimozione silenzi)...")
    audio = applica_vad(audio, sr)

    print("  → Normalizzazione volume...")
    audio = normalizza(audio)

    tmp = tempfile.NamedTemporaryFile(suffix="_clean.wav", delete=False)
    tmp.close()
    sf.write(tmp.name, audio, sr)
    return tmp.name

def carica_modello():
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    model = AutoModelForSpeechSeq2Seq.from_pretrained(MODEL, dtype=dtype, low_cpu_mem_usage=True)
    model.to(device)
    processor = AutoProcessor.from_pretrained(MODEL)
    return pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=dtype,
        device=device,
    )

def trascrivi(pipe, percorso_audio: str) -> dict:
    return pipe(
        percorso_audio,
        generate_kwargs={
            "language": "italian",
            "task": "transcribe",
            "do_sample": False,          # greedy decoding: più conservativo, meno errori
            "num_beams": 5,              # beam search: sceglie il percorso migliore tra 5
            "no_repeat_ngram_size": 7,   # blocca ripetizioni di sequenze lunghe
            "repetition_penalty": 1.3,   # penalizza token già usati
        },
        return_timestamps=True,
    )

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python trascrivi.py <percorso_audio>")
        sys.exit(1)

    audio = sys.argv[1]
    print(f"Carico il modello {MODEL}...")
    pipe = carica_modello()

    print(f"\nPreprocesso: {audio}")
    wav_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    wav_tmp.close()
    converti_in_wav(audio, wav_tmp.name)

    clean_wav = preprocessa(wav_tmp.name)
    os.unlink(wav_tmp.name)

    try:
        print("\nTrascrivo...")
        risultato = trascrivi(pipe, clean_wav)
    finally:
        os.unlink(clean_wav)

    print("\n--- TESTO COMPLETO ---")
    print(risultato["text"])

    print("\n--- SEGMENTI CON TIMESTAMP ---")
    segmenti = []
    for seg in risultato.get("chunks", []):
        inizio, fine = seg["timestamp"]
        fine_str = f"{fine:.1f}s" if fine is not None else "?"
        riga = f"[{inizio:.1f}s - {fine_str}]  {seg['text'].strip()}"
        print(riga)
        segmenti.append(riga)

    base = os.path.splitext(audio)[0]
    with open(f"{base}_testo.txt", "w", encoding="utf-8") as f:
        f.write(risultato["text"].strip())
    with open(f"{base}_timestamp.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(segmenti))
    print(f"\nSalvato: {base}_testo.txt")
    print(f"Salvato: {base}_timestamp.txt")
