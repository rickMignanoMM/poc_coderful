require("dotenv").config();
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { analizzaTipo, pulisciNote, chatConNote } = require("./analisi");

// job store in memoria
const jobs = {};
function creaJob() {
  const id = Date.now().toString();
  jobs[id] = { status: "in_corso", risultato: null, errore: null, logs: [], streaming: "" };
  return id;
}
function aggiungiLog(id, line) {
  if (jobs[id]) jobs[id].logs.push(line);
}
function aggiornaStreaming(id, text) {
  if (jobs[id]) jobs[id].streaming = text;
}
function aggiornaJob(id, status, risultato = null, errore = null) {
  if (jobs[id]) jobs[id] = { status, risultato, errore, logs: jobs[id]?.logs || [], streaming: "" };
}

const app = express();
const PORT = 3443;

const DATA_DIR = path.join(__dirname, "data");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const ARCHIVIO_FILE = path.join(DATA_DIR, "archivio-analisi.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const PYTHON = path.join(__dirname, "../venv/bin/python");
const SCRIPT = path.join(__dirname, "../trascrivi.py");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, "[]");
if (!fs.existsSync(ARCHIVIO_FILE)) fs.writeFileSync(ARCHIVIO_FILE, "[]");

function leggiArchivio() {
  return JSON.parse(fs.readFileSync(ARCHIVIO_FILE, "utf-8"));
}
function salvaArchivio(entries) {
  fs.writeFileSync(ARCHIVIO_FILE, JSON.stringify(entries, null, 2));
}
function aggiungiArchivio(risultato) {
  const entries = leggiArchivio();
  entries.unshift({ id: Date.now().toString(), ...risultato });
  salvaArchivio(entries);
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

function leggiNote() {
  return JSON.parse(fs.readFileSync(NOTES_FILE, "utf-8"));
}

function salvaNote(notes) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}

app.get("/api/notes", (req, res) => {
  res.json(leggiNote());
});

app.post("/api/audio", upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file ricevuto" });

  const nota = {
    id: Date.now().toString(),
    filename: req.file.filename,
    originalName: req.file.originalname,
    createdAt: new Date().toISOString(),
    status: "in_elaborazione",
    testo: null,
  };

  const notes = leggiNote();
  notes.unshift(nota);
  salvaNote(notes);

  res.json({ ok: true, id: nota.id });

  // converti in mp3 per compatibilità Safari/iOS
  const mp3Path = req.file.path.replace(/\.[^.]+$/, ".mp3");
  const conv = spawn("ffmpeg", ["-y", "-i", req.file.path, "-q:a", "4", mp3Path]);
  conv.on("close", () => {
    fs.unlinkSync(req.file.path);
    const mp3Filename = path.basename(mp3Path);
    const aggiornate1 = leggiNote().map((n) =>
      n.id === nota.id ? { ...n, filename: mp3Filename } : n
    );
    salvaNote(aggiornate1);

    const proc = spawn(PYTHON, [SCRIPT, mp3Path]);
    let output = "";
    proc.stdout.on("data", (d) => (output += d.toString()));
    proc.stderr.on("data", () => {});

    proc.on("close", () => {
      const match = output.match(/--- TESTO COMPLETO ---\n([\s\S]*?)\n--- SEGMENTI/);
      const testo = match ? match[1].trim() : output.trim();
      const aggiornate2 = leggiNote().map((n) =>
        n.id === nota.id ? { ...n, status: "completata", testo } : n
      );
      salvaNote(aggiornate2);
    });
  });
});

app.post("/api/pulisci", (req, res) => {
  const jobId = creaJob();
  res.json({ jobId });

  pulisciNote(leggiNote(), (line) => aggiungiLog(jobId, line), (text) => aggiornaStreaming(jobId, text))
    .then((risultato) => {
      const aggiornate = leggiNote().map((n) => {
        const p = risultato.note_pulite.find((x) => x.id === n.id);
        return p ? { ...n, testo_pulito: p.testo_pulito, sentiment: p.sentiment, sintesi: p.sintesi } : n;
      });
      salvaNote(aggiornate);
      aggiornaJob(jobId, "completato", { count: risultato.note_pulite.length });
    })
    .catch((err) => aggiornaJob(jobId, "errore", null, err.message));
});

app.post("/api/analisi", (req, res) => {
  const tipo = req.body?.tipo || "tutto";
  const jobId = creaJob();
  res.json({ jobId });

  analizzaTipo(leggiNote(), tipo, (line) => aggiungiLog(jobId, line), (text) => aggiornaStreaming(jobId, text))
    .then((risultato) => {
      aggiungiArchivio(risultato);
      aggiornaJob(jobId, "completato", risultato);
    })
    .catch((err) => aggiornaJob(jobId, "errore", null, err.message));
});

app.get("/api/archivio", (req, res) => {
  res.json(leggiArchivio());
});

app.delete("/api/archivio/:id", (req, res) => {
  salvaArchivio(leggiArchivio().filter((e) => e.id !== req.params.id));
  res.json({ ok: true });
});

app.post("/api/chat", (req, res) => {
  const { domanda, history } = req.body;
  if (!domanda) return res.status(400).json({ error: "Domanda mancante" });
  const jobId = creaJob();
  res.json({ jobId });
  chatConNote(leggiNote(), domanda, history || [], (line) => aggiungiLog(jobId, line), (text) => aggiornaStreaming(jobId, text))
    .then((risultato) => aggiornaJob(jobId, "completato", risultato))
    .catch((err) => aggiornaJob(jobId, "errore", null, err.message));
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
  const aggiornate = leggiNote().map((n) => {
    if (n.id !== req.params.id) return n;
    const update = {};
    if (testo_pulito !== undefined) update.testo_pulito = testo_pulito;
    if (testo !== undefined) update.testo = testo;
    return { ...n, ...update };
  });
  salvaNote(aggiornate);
  res.json({ ok: true });
});

app.delete("/api/notes/:id", (req, res) => {
  const notes = leggiNote();
  const nota = notes.find((n) => n.id === req.params.id);
  if (nota) {
    const filePath = path.join(UPLOADS_DIR, nota.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  salvaNote(notes.filter((n) => n.id !== req.params.id));
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
