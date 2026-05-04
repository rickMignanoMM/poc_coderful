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

const PROMPT_CHAT_RECAP = `Sei un assistente che corregge e migliora analisi di note vocali in italiano.
L'utente ti mostrerà una sezione di un'analisi e potrà chiederti di modificarla.
Se l'utente chiede una modifica, scrivi prima una brevissima conferma, poi il JSON aggiornato racchiuso esattamente tra <patch> e </patch>.
Il JSON deve avere questa struttura: {"sezione":"eventi|riassunto|suggerimenti|connessioni","data":{...oggetto completo aggiornato...}}
Esempio:
Ho aggiornato il riassunto.
<patch>{"sezione":"riassunto","data":{"contesto":"...","tono":"...","argomenti":["..."],"sintesi":"..."}}</patch>
Se l'utente fa domande generali, rispondi normalmente senza <patch>.
Rispondi sempre in italiano.`;

const PROMPTS = {
  eventi: (text) => [{ role: "user", content: `${PROMPT_EVENTI}\n\n${text}` }],
  riassunto: (text) => [{ role: "user", content: `${PROMPT_RIASSUNTO}\n\n${text}` }],
  suggerimenti: (text) => [{ role: "user", content: `${PROMPT_SUGGERIMENTI}\n\n${text}` }],
  connessioni: (text) => [{ role: "user", content: `${PROMPT_CONNESSIONI}\n\n${text}` }],
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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`llama-server HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

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

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

function currentDateRome() {
  return new Date().toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildContext(notes, useSummary = false) {
  return notes.map((n) => {
    const text = useSummary
      ? (n.sintesi || n.testo_pulito || n.testo || "")
      : (n.testo_pulito || n.testo || "");
    let date = "";
    try {
      date = new Date(n.createdAt).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {}
    return `[${date}] ${text}`;
  }).join("\n");
}

async function cleanNotes(notes, onLog, onStream) {
  const toClean = notes.filter((n) => n.testo && n.status === "completata");
  if (!toClean.length) throw new Error("Nessuna nota da pulire");
  const startTime = Date.now();
  const cleanedNotes = [];

  for (let i = 0; i < toClean.length; i++) {
    const n = toClean[i];
    emitLog(`Pulisco nota ${i + 1}/${toClean.length}...`, startTime, onLog);
    if (onStream) onStream("");

    const [
      { content, evalCount, tokPerSec },
      { content: rawSentiment },
      { content: summary },
    ] = await Promise.all([
      llamaChat([{ role: "system", content: PROMPT_PULIZIA }, { role: "user", content: n.testo }], onStream),
      llamaChat([{ role: "user", content: `${PROMPT_SENTIMENT}\n\n${n.testo}` }], null),
      llamaChat([{ role: "system", content: PROMPT_SINTESI }, { role: "user", content: n.testo }], null),
    ]);

    if (onStream) onStream("");
    const sentiment = extractJson(rawSentiment) || { tono: "neutro", emoji: "😐", label: "neutro" };
    cleanedNotes.push({ id: n.id, testo_pulito: content, sentiment, sintesi: summary.trim() });
    if (evalCount) emitLog(`↳ ${evalCount} tok · ${tokPerSec.toFixed(1)} tok/s`, startTime, onLog);
  }
  return { cleanedNotes };
}

async function analyzeType(notes, type, onLog, onStream, noteIds = null) {
  const toAnalyze = notes.filter((n) => {
    if (n.status !== "completata" || !(n.testo_pulito || n.testo)) return false;
    return noteIds && noteIds.length > 0 ? noteIds.includes(n.id) : true;
  });
  if (!toAnalyze.length) throw new Error("Nessuna nota disponibile per l'analisi");
  const startTime = Date.now();
  const context = buildContext(toAnalyze);
  const text = `Data e ora attuale (fuso orario Roma): ${currentDateRome()}\n\nEcco le note:\n\n${context}`;

  const types = type === "tutto"
    ? ["eventi", "riassunto", "suggerimenti", "connessioni"]
    : [type];

  const rawResults = [];
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    emitLog(`${i + 1}/${types.length} ${LABELS[t]}...`, startTime, onLog);
    if (onStream) onStream("");
    rawResults.push(await llamaChat(PROMPTS[t](text), onStream));
    if (onStream) onStream("");
  }

  const result = {};
  const tokList = [];
  const tpsList = [];

  types.forEach((t, i) => {
    const { content, evalCount, tokPerSec } = rawResults[i];
    if (evalCount) tokList.push(evalCount);
    if (tokPerSec) tpsList.push(tokPerSec);

    if (t === "eventi")       result.eventi       = extractJson(content) || { eventi: [] };
    if (t === "riassunto")    result.riassunto    = extractJson(content) || { contesto: "", tono: "", argomenti: [], sintesi: content };
    if (t === "suggerimenti") result.suggerimenti = extractJson(content) || { suggerimenti: [] };
    if (t === "connessioni")  result.connessioni  = extractJson(content) || { connessioni: [] };
  });

  const totalTok = tokList.reduce((a, b) => a + b, 0);
  const meanTps = tpsList.length ? tpsList.reduce((a, b) => a + b, 0) / tpsList.length : 0;
  if (totalTok) emitLog(`↳ ${totalTok} tok totali · ${meanTps.toFixed(1)} tok/s medio`, startTime, onLog);
  emitLog("Analisi completata ✓", startTime, onLog);

  return { ...result, tipi: types, generatoIl: new Date().toISOString() };
}

async function chatWithNotes(notes, question, history, onLog, onStream) {
  const validNotes = notes.filter((n) => n.status === "completata" && (n.testo_pulito || n.testo));
  if (!validNotes.length) throw new Error("Nessuna nota disponibile");
  const startTime = Date.now();
  const context = buildContext(validNotes, true);

  const messages = [
    { role: "system", content: `${PROMPT_CHAT}\n\nData e ora attuale (fuso orario Roma): ${currentDateRome()}\n\nQueste sono le note vocali dell'utente:\n${context}` },
    ...history.flatMap((t) => [
      { role: "user", content: t.user },
      { role: "assistant", content: t.assistant },
    ]),
    { role: "user", content: question },
  ];

  emitLog("Rispondo...", startTime, onLog);
  if (onStream) onStream("");
  const { content: reply, evalCount, tokPerSec } = await llamaChat(messages, onStream);
  if (onStream) onStream("");
  if (evalCount) emitLog(`↳ ${evalCount} tok · ${tokPerSec.toFixed(1)} tok/s`, startTime, onLog);
  return { reply };
}

async function chatWithRecap(analysis, question, history, onLog, onStream) {
  const startTime = Date.now();
  const messages = [
    {
      role: "system",
      content: `${PROMPT_CHAT_RECAP}\n\nAnalisi attuale:\n${JSON.stringify(analysis, null, 2)}`,
    },
    ...history.flatMap((t) => [
      { role: "user", content: t.user },
      { role: "assistant", content: t.assistant },
    ]),
    { role: "user", content: question },
  ];

  emitLog("Rispondo...", startTime, onLog);
  if (onStream) onStream("");
  const { content: rawReply, evalCount, tokPerSec } = await llamaChat(messages, onStream);
  if (onStream) onStream("");
  if (evalCount) emitLog(`↳ ${evalCount} tok · ${tokPerSec.toFixed(1)} tok/s`, startTime, onLog);

  let patch = null;
  const patchMatch = rawReply.match(/<patch>([\s\S]*?)<\/patch>/);
  if (patchMatch) {
    try { patch = JSON.parse(patchMatch[1].trim()); } catch {}
  }
  if (!patch) {
    const fallback = extractJson(rawReply);
    if (fallback?.sezione && fallback?.data) patch = fallback;
  }
  const reply = rawReply.replace(/<patch>[\s\S]*?<\/patch>/g, "").trim();
  return { reply, patch };
}

module.exports = { cleanNotes, analyzeType, chatWithNotes, chatWithRecap };
