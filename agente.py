import sys
import json
import re
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"

PROMPT_EVENTI = """Sei un assistente che analizza note vocali trascritte in italiano.
Estrai tutti gli eventi, appuntamenti, scadenze e task da schedulare.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"eventi":[{"titolo":"...","data":"...","priorita":"alta|media|bassa","contesto":"..."}]}
Se non ci sono eventi rispondi: {"eventi":[]}"""

PROMPT_RIASSUNTO = """Sei un assistente che analizza note vocali trascritte in italiano.
Produci un riassunto strutturato.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"contesto":"...","tono":"...","argomenti":["...","..."],"sintesi":"..."}"""

PROMPT_SUGGERIMENTI = """Sei un assistente che analizza note vocali trascritte in italiano.
Fornisci 3-5 suggerimenti pratici e hint di miglioramento basati sul contenuto.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"suggerimenti":[{"titolo":"...","descrizione":"...","priorita":"alta|media|bassa"}]}"""


def carica_modello():
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=dtype, device_map="auto")
    return tokenizer, model


def chiedi(tokenizer, model, prompt, testo):
    chat = [{"role": "user", "content": f"{prompt}\n\nEcco le note:\n\n{testo}"}]
    text = tokenizer.apply_chat_template(chat, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=0.3,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    return tokenizer.decode(output[0][inputs.input_ids.shape[-1]:], skip_special_tokens=True).strip()


def estrai_json(testo):
    match = re.search(r'\{[\s\S]*\}', testo)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Nessun input fornito"}))
        sys.exit(1)

    notes = json.loads(sys.argv[1])
    note_valide = [n for n in notes if n.get("status") == "completata" and (n.get("testo_pulito") or n.get("testo"))]

    if not note_valide:
        print(json.dumps({"error": "Nessuna nota disponibile per l'analisi"}))
        sys.exit(1)

    # usa testo_pulito se disponibile, altrimenti testo grezzo
    testo_analisi = "\n\n---\n\n".join(
        f"[Nota {i+1} - {n['id']}]\n{n.get('testo_pulito') or n['testo']}"
        for i, n in enumerate(note_valide)
    )

    print("Carico il modello...", file=sys.stderr)
    tokenizer, model = carica_modello()
    print("Modello caricato.", file=sys.stderr)

    risultati = {}

    print("Estraggo eventi...", file=sys.stderr)
    r = chiedi(tokenizer, model, PROMPT_EVENTI, testo_analisi)
    risultati["eventi"] = estrai_json(r) or {"eventi": []}

    print("Riassumo...", file=sys.stderr)
    r = chiedi(tokenizer, model, PROMPT_RIASSUNTO, testo_analisi)
    risultati["riassunto"] = estrai_json(r) or {"contesto": "", "tono": "", "argomenti": [], "sintesi": r}

    print("Genero suggerimenti...", file=sys.stderr)
    r = chiedi(tokenizer, model, PROMPT_SUGGERIMENTI, testo_analisi)
    risultati["suggerimenti"] = estrai_json(r) or {"suggerimenti": []}

    risultati["generatoIl"] = __import__("datetime").datetime.now().isoformat()
    print(json.dumps(risultati, ensure_ascii=False))
