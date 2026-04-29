import sys
import json
import re
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"

PROMPT = """Sei un correttore di trascrizioni audio in italiano.
Il testo potrebbe contenere parole storpiate, frasi incomplete, ripetizioni o errori di trascrizione automatica.
Correggi il testo rendendolo naturale e leggibile in italiano, mantenendo il significato originale.
Se una parola è chiaramente sbagliata, correggila con quella più probabile nel contesto.
Rispondi SOLO con il testo corretto, senza spiegazioni."""


def pulizia_regex(testo: str) -> str:
    testo = re.sub(r'\b(\w+)(\s+\1){2,}\b', r'\1', testo, flags=re.IGNORECASE)
    testo = re.sub(r'(.{10,100}?)(\s+\1)+', r'\1', testo, flags=re.IGNORECASE)
    testo = re.sub(r'([a-zA-Z])\1{3,}', r'\1\1', testo)
    testo = re.sub(r'\b(ah|eh|uhm|mhm|mmm|uh|hmm)\b', '', testo, flags=re.IGNORECASE)
    testo = re.sub(r'\s+', ' ', testo)
    return testo.strip()


def carica_modello():
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=dtype, device_map="auto")
    return tokenizer, model


def pulisci_con_llm(tokenizer, model, testo: str) -> str:
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": testo},
    ]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=256,
            temperature=0.2,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    risposta = tokenizer.decode(output[0][inputs.input_ids.shape[-1]:], skip_special_tokens=True)
    return risposta.strip()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Nessun input fornito"}))
        sys.exit(1)

    notes = json.loads(sys.argv[1])
    da_pulire = [n for n in notes if n.get("testo") and n.get("status") == "completata"]

    if not da_pulire:
        print(json.dumps({"error": "Nessuna nota da pulire"}))
        sys.exit(1)

    print(f"Carico {MODEL}...", file=sys.stderr)
    tokenizer, model = carica_modello()
    print(f"Modello caricato. {len(da_pulire)} note da pulire.", file=sys.stderr)

    note_pulite = []
    for i, nota in enumerate(da_pulire):
        print(f"[{i+1}/{len(da_pulire)}] {nota['id']}...", file=sys.stderr)
        testo_pre = pulizia_regex(nota["testo"])
        testo_pulito = pulisci_con_llm(tokenizer, model, testo_pre)
        note_pulite.append({"id": nota["id"], "testo_pulito": testo_pulito})
        print(f"  '{nota['testo']}' → '{testo_pulito}'", file=sys.stderr)

    print(json.dumps({"note_pulite": note_pulite}, ensure_ascii=False))
