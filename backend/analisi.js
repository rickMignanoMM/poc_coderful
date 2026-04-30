const LLAMA_BASE = "http://127.0.0.1:8080";

const PROMPT_PULIZIA = `Sei un correttore di trascrizioni audio in italiano.
Il testo potrebbe contenere parole storpiate, frasi incomplete, ripetizioni o errori di trascrizione automatica.
Correggi il testo rendendolo naturale e leggibile in italiano, mantenendo il significato originale.
Se una parola è chiaramente sbagliata, correggila con quella più probabile nel contesto.
Rispondi SOLO con il testo corretto, senza spiegazioni.`;

const PROMPT_SINTESI = `Riassumi questa nota vocale in italiano in 1-2 frasi concise.
Mantieni le informazioni chiave: chi, cosa, quando, dove, decisioni prese, task menzionati.
Rispondi SOLO con il testo del riassunto, senza prefissi o spiegazioni.`;

const PROMPT_SENTIMENT = `Analizza il tono emotivo di questa nota vocale in italiano.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"tono":"positivo|negativo|neutro|stressato|entusiasta|preoccupato|riflessivo","emoji":"😊|😟|😐|😰|🚀|😨|🤔","label":"max 2 parole"}`;

const PROMPT_EVENTI = `Sei un assistente che analizza note vocali trascritte in italiano.
Estrai tutti gli eventi, appuntamenti, scadenze e task da schedulare.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"eventi":[{"titolo":"...","data":"...","priorita":"alta|media|bassa","contesto":"..."}]}
Se non ci sono eventi rispondi: {"eventi":[]}`;

const PROMPT_RIASSUNTO = `Sei un assistente che analizza note vocali trascritte in italiano.
Produci un riassunto strutturato.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"contesto":"...","tono":"...","argomenti":["...","..."],"sintesi":"..."}`;

const PROMPT_SUGGERIMENTI = `Sei un assistente che analizza note vocali trascritte in italiano.
Fornisci 3-5 suggerimenti pratici e hint di miglioramento basati sul contenuto.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"suggerimenti":[{"titolo":"...","descrizione":"...","priorita":"alta|media|bassa"}]}`;

const PROMPT_CONNESSIONI = `Analizza le seguenti note vocali e trova connessioni tematiche significative tra di esse.
Rispondi SOLO con un JSON valido, senza testo aggiuntivo, senza markdown:
{"connessioni":[{"tema":"...","note":["data nota 1","data nota 2"],"descrizione":"max 1 frase"}]}
Se non ci sono connessioni significative rispondi: {"connessioni":[]}`;

const PROMPT_CHAT = `Sei un assistente personale che risponde a domande sulle note vocali dell'utente.
Le note sono trascrizioni di messaggi vocali registrati dall'utente in italiano, con data e ora.
Rispondi sempre in italiano, in modo conciso e diretto.
Usa solo le informazioni presenti nelle note fornite.
Se la risposta non è nelle note, dillo chiaramente senza inventare nulla.`;

const PROMPTS = {
  eventi: (testo) => [{ role: "user", content: `${PROMPT_EVENTI}\n\n${testo}` }],
  riassunto: (testo) => [{ role: "user", content: `${PROMPT_RIASSUNTO}\n\n${testo}` }],
  suggerimenti: (testo) => [{ role: "user", content: `${PROMPT_SUGGERIMENTI}\n\n${testo}` }],
  connessioni: (testo) => [{ role: "user", content: `${PROMPT_CONNESSIONI}\n\n${testo}` }],
};

const LABELS = {
  eventi: "eventi e task",
  riassunto: "riassunto",
  suggerimenti: "suggerimenti",
  connessioni: "connessioni",
};

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function emitLog(msg, startTime, onLog) {
  if (!onLog) return;
  const elapsed = formatElapsed(Date.now() - startTime);
  onLog(`[${elapsed}] ${msg}`);
}

async function llamaChat(messages, onStream) {
  const res = await fetch(`${LLAMA_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: true, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`llama-server HTTP ${res.status}`);

  let fullContent = "";
  let evalCount = 0;
  let tokPerSec = 0;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          if (onStream) onStream(fullContent);
        }
        if (chunk.timings?.predicted_per_second) {
          tokPerSec = chunk.timings.predicted_per_second;
          evalCount = chunk.usage?.completion_tokens ?? 0;
        }
      } catch {}
    }
  }

  return { content: fullContent.trim(), evalCount, tokPerSec };
}

function estraiJson(testo) {
  const match = testo.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

function dataOggiRoma() {
  return new Date().toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function costruisciContesto(notes, usaSintesi = false) {
  return notes.map((n) => {
    const testo = usaSintesi
      ? (n.sintesi || n.testo_pulito || n.testo || "")
      : (n.testo_pulito || n.testo || "");
    let data = "";
    try {
      data = new Date(n.createdAt).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {}
    return `[${data}] ${testo}`;
  }).join("\n");
}

async function pulisciNote(notes, onLog, onStream) {
  const da_pulire = notes.filter((n) => n.testo && n.status === "completata");
  if (!da_pulire.length) throw new Error("Nessuna nota da pulire");
  const startTime = Date.now();
  const note_pulite = [];

  for (let i = 0; i < da_pulire.length; i++) {
    const n = da_pulire[i];
    emitLog(`Pulisco nota ${i + 1}/${da_pulire.length}...`, startTime, onLog);
    if (onStream) onStream("");

    const [
      { content, evalCount, tokPerSec },
      { content: rSent },
      { content: sintesi },
    ] = await Promise.all([
      llamaChat([{ role: "system", content: PROMPT_PULIZIA }, { role: "user", content: n.testo }], onStream),
      llamaChat([{ role: "user", content: `${PROMPT_SENTIMENT}\n\n${n.testo}` }], null),
      llamaChat([{ role: "system", content: PROMPT_SINTESI }, { role: "user", content: n.testo }], null),
    ]);

    if (onStream) onStream("");
    const sentiment = estraiJson(rSent) || { tono: "neutro", emoji: "😐", label: "neutro" };
    note_pulite.push({ id: n.id, testo_pulito: content, sentiment, sintesi: sintesi.trim() });
    if (evalCount) emitLog(`↳ ${evalCount} tok · ${tokPerSec.toFixed(1)} tok/s`, startTime, onLog);
  }
  return { note_pulite };
}

// tipo: "tutto" | "eventi" | "riassunto" | "suggerimenti" | "connessioni"
// noteIds: array di id da analizzare, null = tutte
async function analizzaTipo(notes, tipo, onLog, onStream, noteIds = null) {
  const da_analizzare = notes.filter((n) => {
    if (n.status !== "completata" || !(n.testo_pulito || n.testo)) return false;
    return noteIds && noteIds.length > 0 ? noteIds.includes(n.id) : true;
  });
  if (!da_analizzare.length) throw new Error("Nessuna nota disponibile per l'analisi");
  const startTime = Date.now();
  const contesto = costruisciContesto(da_analizzare);
  const testo = `Data e ora attuale (fuso orario Roma): ${dataOggiRoma()}\n\nEcco le note:\n\n${contesto}`;

  const tipi = tipo === "tutto"
    ? ["eventi", "riassunto", "suggerimenti", "connessioni"]
    : [tipo];

  emitLog(`Analisi: ${tipi.map((t) => LABELS[t]).join(" · ")}...`, startTime, onLog);
  if (onStream) onStream("");

  const risultati = await Promise.all(
    tipi.map((t, i) => llamaChat(PROMPTS[t](testo), i === 0 ? onStream : null))
  );

  if (onStream) onStream("");

  const result = {};
  const tokList = [];
  const tpsList = [];

  tipi.forEach((t, i) => {
    const { content, evalCount, tokPerSec } = risultati[i];
    if (evalCount) tokList.push(evalCount);
    if (tokPerSec) tpsList.push(tokPerSec);

    if (t === "eventi")      result.eventi      = estraiJson(content) || { eventi: [] };
    if (t === "riassunto")   result.riassunto   = estraiJson(content) || { contesto: "", tono: "", argomenti: [], sintesi: content };
    if (t === "suggerimenti") result.suggerimenti = estraiJson(content) || { suggerimenti: [] };
    if (t === "connessioni") result.connessioni  = estraiJson(content) || { connessioni: [] };
  });

  const totTok = tokList.reduce((a, b) => a + b, 0);
  const meanTps = tpsList.length ? tpsList.reduce((a, b) => a + b, 0) / tpsList.length : 0;
  if (totTok) emitLog(`↳ ${totTok} tok totali · ${meanTps.toFixed(1)} tok/s medio`, startTime, onLog);
  emitLog("Analisi completata ✓", startTime, onLog);

  return { ...result, tipi, generatoIl: new Date().toISOString() };
}

async function chatConNote(notes, domanda, history, onLog, onStream) {
  const note_valide = notes.filter((n) => n.status === "completata" && (n.testo_pulito || n.testo));
  if (!note_valide.length) throw new Error("Nessuna nota disponibile");
  const startTime = Date.now();
  const contesto = costruisciContesto(note_valide, true);

  const messages = [
    { role: "system", content: `${PROMPT_CHAT}\n\nData e ora attuale (fuso orario Roma): ${dataOggiRoma()}\n\nQueste sono le note vocali dell'utente:\n${contesto}` },
    ...history.flatMap((t) => [
      { role: "user", content: t.user },
      { role: "assistant", content: t.assistant },
    ]),
    { role: "user", content: domanda },
  ];

  emitLog("Rispondo...", startTime, onLog);
  if (onStream) onStream("");
  const { content: risposta, evalCount, tokPerSec } = await llamaChat(messages, onStream);
  if (onStream) onStream("");
  if (evalCount) emitLog(`↳ ${evalCount} tok · ${tokPerSec.toFixed(1)} tok/s`, startTime, onLog);
  return { risposta };
}

module.exports = { pulisciNote, analizzaTipo, chatConNote };
