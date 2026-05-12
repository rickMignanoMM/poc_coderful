require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { analyzeType, cleanNotes, chatFree, chatWithNotes, chatWithRecap } = require("./analisi");

// in-memory job store
const jobs = {};
function createJob() {
  const id = Date.now().toString();
  const abortController = new AbortController();
  jobs[id] = { status: "pending", result: null, error: null, logs: [], streaming: "", abortController };
  return id;
}
function getSignal(id) {
  return jobs[id]?.abortController.signal;
}
function addLog(id, line) {
  if (jobs[id]) jobs[id].logs.push(line);
}
function updateStreaming(id, text) {
  if (jobs[id]) jobs[id].streaming = text;
}
function updateJob(id, status, result = null, error = null) {
  if (jobs[id]) jobs[id] = { status, result, error, logs: jobs[id]?.logs || [], streaming: "" };
}

const app = express();
const PORT = 3443;

const DATA_DIR = path.join(__dirname, "data");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const ARCHIVE_FILE = path.join(DATA_DIR, "archivio-analisi.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const WHISPER_URL = `http://127.0.0.1:${process.env.WHISPER_PORT || 8765}`;

async function whisperTranscribe(audioPath) {
  const signal = AbortSignal.timeout(600_000);
  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: audioPath }),
    signal,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Whisper error");
  return data.testo;
}

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, "[]");
if (!fs.existsSync(ARCHIVE_FILE)) fs.writeFileSync(ARCHIVE_FILE, "[]");

function readArchive() {
  return JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8"));
}
function saveArchive(entries) {
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(entries, null, 2));
}
function generateTitle(result) {
  const date = new Date(result.generatoIl).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  if (result.riassunto?.contesto) return `${result.riassunto.contesto} — ${date}`;
  if (result.riassunto?.argomenti?.[0]) return `${result.riassunto.argomenti[0]} — ${date}`;
  const types = (result.tipi || []).join(", ");
  return `Analisi ${types} — ${date}`;
}

function addToArchive(result) {
  const entries = readArchive();
  const id = Date.now().toString();
  entries.unshift({ id, titolo: generateTitle(result), ...result });
  saveArchive(entries);
  return id;
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${file.originalname}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/audio", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "../frontend/dist")));

function readNotes() {
  return JSON.parse(fs.readFileSync(NOTES_FILE, "utf-8"));
}

function saveNotes(notes) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}

let cachedContextSize = 0;
async function fetchContextSize() {
  if (cachedContextSize) return cachedContextSize;
  try {
    const aiBase = process.env.AI_BASE_URL || "http://127.0.0.1:8080";
    const res = await fetch(`${aiBase}/props`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    cachedContextSize = data.default_generation_settings?.n_ctx || 0;
  } catch {}
  return cachedContextSize;
}

app.get("/api/config", async (req, res) => {
  let specs = null;
  let peers = [];
  try { specs = JSON.parse(process.env.DEVICE_SPECS || "null"); } catch {}
  try { peers = JSON.parse(process.env.PEERS || "[]"); } catch {}
  const contextSize = await fetchContextSize();
  res.json({
    deviceName: process.env.DEVICE_NAME || "Dispositivo",
    deviceSubtitle: process.env.DEVICE_SUBTITLE || "",
    deviceSpecs: specs,
    peers,
    aiModel: process.env.AI_MODEL || null,
    contextSize,
  });
});

app.get("/api/notes", (req, res) => {
  res.json(readNotes());
});

app.post("/api/audio", upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file ricevuto" });

  const note = {
    id: Date.now().toString(),
    filename: req.file.filename,
    originalName: req.file.originalname,
    createdAt: new Date().toISOString(),
    status: "in_elaborazione",
    testo: null,
  };

  const notes = readNotes();
  notes.unshift(note);
  saveNotes(notes);

  res.json({ ok: true, id: note.id });

  const mp3Path = req.file.path.replace(/\.[^.]+$/, ".mp3");
  const conv = spawn("ffmpeg", ["-y", "-i", req.file.path, "-q:a", "4", mp3Path]);
  conv.on("close", (code) => {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (code !== 0) {
      console.error(`ffmpeg conversion failed (exit ${code}) for ${req.file.path}`);
      saveNotes(readNotes().map((n) =>
        n.id === note.id ? { ...n, status: "completata", testo: "" } : n
      ));
      return;
    }
    const mp3Filename = path.basename(mp3Path);
    const updated1 = readNotes().map((n) =>
      n.id === note.id ? { ...n, filename: mp3Filename } : n
    );
    saveNotes(updated1);

    whisperTranscribe(mp3Path)
      .then((testo) => {
        saveNotes(readNotes().map((n) =>
          n.id === note.id ? { ...n, status: "completata", testo } : n
        ));
      })
      .catch((err) => {
        console.error("Whisper error:", err.message);
        saveNotes(readNotes().map((n) =>
          n.id === note.id ? { ...n, status: "completata", testo: "" } : n
        ));
      });
  });
});

app.post("/api/pulisci", (req, res) => {
  const jobId = createJob();
  res.json({ jobId });

  cleanNotes(readNotes(), (line) => addLog(jobId, line), (text) => updateStreaming(jobId, text))
    .then((result) => {
      const updated = readNotes().map((n) => {
        const p = result.cleanedNotes.find((x) => x.id === n.id);
        return p ? { ...n, testo_pulito: p.testo_pulito, sentiment: p.sentiment, sintesi: p.sintesi } : n;
      });
      saveNotes(updated);
      updateJob(jobId, "completed", { count: result.cleanedNotes.length });
    })
    .catch((err) => updateJob(jobId, "failed", null, err.message));
});

app.post("/api/analisi", (req, res) => {
  const type = req.body?.tipo || "tutto";
  const noteIds = req.body?.noteIds || null;
  const jobId = createJob();
  res.json({ jobId });

  analyzeType(readNotes(), type, (line) => addLog(jobId, line), (text) => updateStreaming(jobId, text), noteIds)
    .then((result) => {
      const archiveId = addToArchive(result);
      updateJob(jobId, "completed", { ...result, archiveId });
    })
    .catch((err) => updateJob(jobId, "failed", null, err.message));
});

app.get("/api/archivio", (req, res) => {
  res.json(readArchive());
});

app.patch("/api/archivio/:id", (req, res) => {
  const updated = readArchive().map((e) =>
    e.id === req.params.id ? { ...e, ...req.body } : e
  );
  saveArchive(updated);
  res.json({ ok: true });
});

app.delete("/api/archivio/:id", (req, res) => {
  saveArchive(readArchive().filter((e) => e.id !== req.params.id));
  res.json({ ok: true });
});

app.post("/api/chat-recap", (req, res) => {
  const { question, history, analysis } = req.body;
  if (!question) return res.status(400).json({ error: "Domanda mancante" });
  if (!analysis) return res.status(400).json({ error: "Analisi mancante" });
  const jobId = createJob();
  res.json({ jobId });
  chatWithRecap(analysis, question, history || [], (line) => addLog(jobId, line), (text) => updateStreaming(jobId, text), getSignal(jobId))
    .then((result) => updateJob(jobId, "completed", result))
    .catch((err) => {
      if (err.name === "AbortError") updateJob(jobId, "cancelled");
      else updateJob(jobId, "failed", null, err.message);
    });
});

app.post("/api/chat", (req, res) => {
  const { question, history, mode } = req.body;
  if (!question) return res.status(400).json({ error: "Domanda mancante" });
  const jobId = createJob();
  res.json({ jobId });
  const fn = mode === "free"
    ? chatFree(question, history || [], (line) => addLog(jobId, line), (text) => updateStreaming(jobId, text), getSignal(jobId))
    : chatWithNotes(readNotes(), question, history || [], (line) => addLog(jobId, line), (text) => updateStreaming(jobId, text), getSignal(jobId));
  fn.then((result) => updateJob(jobId, "completed", result))
    .catch((err) => {
      if (err.name === "AbortError") updateJob(jobId, "cancelled");
      else updateJob(jobId, "failed", null, err.message);
    });
});

app.post("/api/job/:id/cancel", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: "Job non trovato" });
  job.abortController.abort();
  res.json({ ok: true });
});

app.get("/api/job/:id", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: "Job non trovato" });
  res.json(job);
});

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

app.patch("/api/notes/:id", (req, res) => {
  const { testo_pulito, testo } = req.body;
  const updated = readNotes().map((n) => {
    if (n.id !== req.params.id) return n;
    const patch = {};
    if (testo_pulito !== undefined) patch.testo_pulito = testo_pulito;
    if (testo !== undefined) patch.testo = testo;
    return { ...n, ...patch };
  });
  saveNotes(updated);
  res.json({ ok: true });
});

app.post("/api/notes/testo", (req, res) => {
  const { testo } = req.body;
  if (!testo?.trim()) return res.status(400).json({ error: "Testo mancante" });
  const note = {
    id: Date.now().toString(),
    filename: null,
    originalName: null,
    createdAt: new Date().toISOString(),
    status: "completata",
    testo: testo.trim(),
  };
  const notes = readNotes();
  notes.unshift(note);
  saveNotes(notes);
  res.json({ ok: true, id: note.id });
});

app.post("/api/notes/:id/retranscribe", (req, res) => {
  const notes = readNotes();
  const note = notes.find((n) => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: "Nota non trovata" });
  if (!note.filename) return res.status(400).json({ error: "Nessun file audio" });

  const mp3Path = path.join(UPLOADS_DIR, note.filename);
  if (!fs.existsSync(mp3Path)) return res.status(404).json({ error: "File audio non trovato" });

  saveNotes(notes.map((n) => n.id === note.id ? { ...n, status: "in_elaborazione", testo: null } : n));
  res.json({ ok: true });

  whisperTranscribe(mp3Path)
    .then((testo) => {
      saveNotes(readNotes().map((n) =>
        n.id === note.id ? { ...n, status: "completata", testo } : n
      ));
    })
    .catch((err) => {
      console.error("Whisper retranscribe error:", err.message);
      saveNotes(readNotes().map((n) =>
        n.id === note.id ? { ...n, status: "completata", testo: "" } : n
      ));
    });
});

app.post("/api/notes/import", (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: "Formato non valido" });
  const existing = readNotes();
  const existingIds = new Set(existing.map((n) => n.id));
  const added = incoming.filter((n) => n.id && n.testo && !existingIds.has(n.id));
  saveNotes([...added, ...existing]);
  res.json({ ok: true, imported: added.length });
});

app.delete("/api/notes/:id", (req, res) => {
  const notes = readNotes();
  const note = notes.find((n) => n.id === req.params.id);
  if (note) {
    const filePath = path.join(UPLOADS_DIR, note.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  saveNotes(notes.filter((n) => n.id !== req.params.id));
  res.json({ ok: true });
});

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(__dirname, "key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "cert.pem")),
  },
  app
);

server.listen(PORT, "0.0.0.0", () => {
  const { networkInterfaces } = require("os");
  const ip = Object.values(networkInterfaces()).flat()
    .find((i) => i.family === "IPv4" && !i.internal)?.address ?? "localhost";
  console.log(`Server HTTPS su https://${ip}:${PORT}`);
});

const http = require("http");
http.createServer(app).listen(3000, "0.0.0.0", () => {
  console.log(`Server HTTP su http://localhost:3000 (ngrok)`);
});
