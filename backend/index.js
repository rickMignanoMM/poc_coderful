require("dotenv").config();
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { analyzeType, cleanNotes, chatWithNotes, chatWithRecap } = require("./analisi");

// in-memory job store
const jobs = {};
function createJob() {
  const id = Date.now().toString();
  jobs[id] = { status: "pending", result: null, error: null, logs: [], streaming: "" };
  return id;
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
const PYTHON = path.join(__dirname, "../venv/bin/python");
const SCRIPT = path.join(__dirname, "../trascrivi.py");

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

app.use(cors());
app.use(express.json());
app.use("/audio", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "../frontend/dist")));

function readNotes() {
  return JSON.parse(fs.readFileSync(NOTES_FILE, "utf-8"));
}

function saveNotes(notes) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}

app.get("/api/config", (req, res) => {
  let specs = null;
  try { specs = JSON.parse(process.env.DEVICE_SPECS || "null"); } catch {}
  res.json({
    deviceName: process.env.DEVICE_NAME || "Dispositivo",
    deviceSubtitle: process.env.DEVICE_SUBTITLE || "",
    deviceSpecs: specs,
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
  conv.on("close", () => {
    fs.unlinkSync(req.file.path);
    const mp3Filename = path.basename(mp3Path);
    const updated1 = readNotes().map((n) =>
      n.id === note.id ? { ...n, filename: mp3Filename } : n
    );
    saveNotes(updated1);

    const proc = spawn(PYTHON, [SCRIPT, mp3Path]);
    let output = "";
    proc.stdout.on("data", (d) => (output += d.toString()));
    proc.stderr.on("data", () => {});

    proc.on("close", () => {
      const match = output.match(/--- TESTO COMPLETO ---\n([\s\S]*?)\n--- SEGMENTI/);
      const testo = match ? match[1].trim() : output.trim();
      const updated2 = readNotes().map((n) =>
        n.id === note.id ? { ...n, status: "completata", testo } : n
      );
      saveNotes(updated2);
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
  chatWithRecap(analysis, question, history || [], (line) => addLog(jobId, line), (text) => updateStreaming(jobId, text))
    .then((result) => updateJob(jobId, "completed", result))
    .catch((err) => updateJob(jobId, "failed", null, err.message));
});

app.post("/api/chat", (req, res) => {
  const { question, history } = req.body;
  if (!question) return res.status(400).json({ error: "Domanda mancante" });
  const jobId = createJob();
  res.json({ jobId });
  chatWithNotes(readNotes(), question, history || [], (line) => addLog(jobId, line), (text) => updateStreaming(jobId, text))
    .then((result) => updateJob(jobId, "completed", result))
    .catch((err) => updateJob(jobId, "failed", null, err.message));
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
  console.log(`Server HTTPS su https://172.16.31.208:${PORT}`);
});

const http = require("http");
http.createServer(app).listen(3000, "0.0.0.0", () => {
  console.log(`Server HTTP su http://localhost:3000 (ngrok)`);
});
