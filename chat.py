import sys
import json
import torch
from datetime import datetime
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"

SYSTEM_PROMPT = """Sei un assistente personale che risponde a domande sulle note vocali dell'utente.
Le note sono trascrizioni di messaggi vocali registrati dall'utente in italiano, con data e ora.
Rispondi sempre in italiano, in modo conciso e diretto.
Usa solo le informazioni presenti nelle note fornite.
Se la risposta non è nelle note, dillo chiaramente senza inventare nulla."""


def carica_modello():
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=dtype, device_map="auto")
    return tokenizer, model


def costruisci_contesto(notes):
    righe = ["Queste sono le note vocali dell'utente:\n"]
    for n in notes:
        testo = n.get("testo_pulito") or n.get("testo") or ""
        if not testo:
            continue
        try:
            dt = datetime.fromisoformat(n["createdAt"].replace("Z", "+00:00"))
            data = dt.strftime("%d/%m/%Y %H:%M")
        except Exception:
            data = n.get("createdAt", "")
        righe.append(f"[{data}] {testo}")
    return "\n".join(righe)


def chiedi(tokenizer, model, contesto, history, domanda):
    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + contesto}]
    for turn in history:
        messages.append({"role": "user", "content": turn["user"]})
        messages.append({"role": "assistant", "content": turn["assistant"]})
    messages.append({"role": "user", "content": domanda})

    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.3,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    return tokenizer.decode(output[0][inputs.input_ids.shape[-1]:], skip_special_tokens=True).strip()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Nessun input fornito"}))
        sys.exit(1)

    payload = json.loads(sys.argv[1])
    notes = payload["notes"]
    history = payload.get("history", [])
    domanda = payload["domanda"]

    note_valide = [n for n in notes if n.get("status") == "completata" and (n.get("testo_pulito") or n.get("testo"))]
    if not note_valide:
        print(json.dumps({"error": "Nessuna nota disponibile"}))
        sys.exit(1)

    print("Carico il modello...", file=sys.stderr)
    tokenizer, model = carica_modello()
    print("Modello caricato.", file=sys.stderr)

    contesto = costruisci_contesto(note_valide)
    print("Rispondo...", file=sys.stderr)
    risposta = chiedi(tokenizer, model, contesto, history, domanda)

    print(json.dumps({"risposta": risposta}, ensure_ascii=False))
