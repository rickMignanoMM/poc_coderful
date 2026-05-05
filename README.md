# poc_coderful

POC di AI locale per trascrizione, analisi e chat su note vocali.  
Gira interamente on-premise — nessuna chiamata cloud.

**Stack:** Vue 3 · Node.js · llama.cpp · faster-whisper · Gemma 4 26B MoE

---

## Prerequisiti

| Tool | Versione minima |
|------|----------------|
| Node.js | 18+ |
| Python | 3.10+ |
| ffmpeg | qualsiasi |
| llama.cpp | build recente con server |
| mkcert | per i certificati HTTPS |

```bash
# Ubuntu / Debian
sudo apt install ffmpeg python3-venv
# mkcert
sudo apt install mkcert   # oppure: brew install mkcert (macOS)
```

---

## 1. Clona il repo

```bash
git clone https://github.com/rickMignanoMM/poc_coderful.git
cd poc_coderful
```

---

## 2. Installa le dipendenze Python

```bash
python3 -m venv venv
venv/bin/pip install faster-whisper
```

---

## 3. Installa le dipendenze Node

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

---

## 4. Certificati HTTPS (una volta sola)

```bash
cd backend
mkcert -install
mkcert localhost 127.0.0.1 <IP_LAN>   # es. 192.168.1.10
mv localhost+2.pem cert.pem
mv localhost+2-key.pem key.pem
cd ..
```

> Se non vuoi usare mkcert puoi generare un self-signed:
> ```bash
> openssl req -x509 -newkey rsa:2048 -keyout backend/key.pem \
>   -out backend/cert.pem -days 3650 -nodes -subj "/CN=localhost"
> ```

---

## 5. Configura le variabili d'ambiente

```bash
cp backend/.env.example backend/.env
```

Modifica `backend/.env`:

```env
# URL del server LLM (llama.cpp o Ollama)
AI_BASE_URL=http://127.0.0.1:8080

# Nome del modello (hash blob per llama.cpp, nome per Ollama)
AI_MODEL=sha256-xxxx   # oppure: gemma4:26b

# Nome visualizzato nel badge dispositivo
DEVICE_NAME=Il mio PC
DEVICE_SUBTITLE=Intel Core Ultra 7 · Gemma 4 26B

# Specifiche hardware (JSON) — mostrate nel badge
DEVICE_SPECS={"hardware":{"CPU":"...","RAM":"..."},"ai":{"Modello":"...","Runtime":"..."}}

# Altri backend raggiungibili in LAN (opzionale)
PEERS=[{"name":"Jetson Orin","url":"https://192.168.1.20:3443"}]
```

---

## 6. Scarica e avvia il modello LLM

### Opzione A — llama.cpp (consigliata su CPU)

```bash
# Scarica llama-server da https://github.com/ggml-org/llama.cpp/releases
# Copia il binario e le librerie in ~/llama-cpp/

# Scarica il modello (es. Gemma 4 26B Q4_K_M) — il blob Ollama funziona:
ollama pull gemma4:26b
# Il blob si trova in /usr/share/ollama/.ollama/models/blobs/sha256-...

bash start-llama.sh
```

### Opzione B — Ollama (più semplice)

```bash
ollama serve &
ollama pull gemma4:26b   # o qwen3:30b o qualsiasi modello
# In .env: AI_BASE_URL=http://127.0.0.1:11434  AI_MODEL=gemma4:26b
```

---

## 7. Build del frontend

```bash
cd frontend && npm run build && cd ..
```

---

## 8. Avvia tutto

```bash
bash start.sh
```

Lo script fa in ordine:
1. Imposta il CPU governor a `performance` (richiede sudo — vedi sotto)
2. Verifica che Ollama sia attivo (se usato)
3. Avvia il **Whisper server** su `:8765` (carica il modello una volta sola)
4. Avvia il **backend Node.js** su `:3443` (HTTPS) e `:3000` (HTTP)

Apri il browser su `https://<IP_LAN>:3443` o `http://localhost:3000`.

---

## Setup una-tantum: CPU governor senza password

Permette a `start.sh` di impostare `performance` senza richiedere la password sudo ad ogni avvio.

```bash
sudo install -m 0440 tools/50-poc-cpu-governor /etc/sudoers.d/
```

---

## Setup Jetson Orin

```bash
git clone https://github.com/rickMignanoMM/poc_coderful.git
cd poc_coderful

# Python deps
python3 -m venv venv && venv/bin/pip install faster-whisper

# Node deps
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..

# Certificati
cd backend
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 3650 -nodes -subj "/CN=jetson"
cd ..

# .env: AI_BASE_URL=http://127.0.0.1:11434  DEVICE_NAME=Jetson Orin  ecc.

# Sudo passwordless per nvpmodel e jetson_clocks
sudo visudo -f /etc/sudoers.d/jetson-performance
# aggiungi: <utente> ALL=(ALL) NOPASSWD: /usr/sbin/nvpmodel, /usr/bin/jetson_clocks

chmod +x start-jetson.sh
./start-jetson.sh
```

---

## Struttura del progetto

```
poc_coderful/
├── backend/
│   ├── index.js          # Express API + job store
│   ├── analisi.js        # Prompt, streaming LLM, RAG-lite
│   ├── power.js          # RAPL (Intel) / INA (Jetson) sampler
│   └── data/             # notes.json, archivio-analisi.json, uploads/
├── frontend/
│   └── src/
│       ├── views/
│       │   ├── BackofficeApp.vue   # UI principale
│       │   └── MobileApp.vue       # UI mobile per registrazione
│       └── composables/
│           └── useApi.js           # Singleton backend URL + fetch
├── whisper_server.py     # HTTP server Whisper persistente (:8765)
├── start.sh              # Avvio completo Tuxedo
├── start-llama.sh        # Avvio llama-server ottimizzato
├── start-jetson.sh       # Avvio completo Jetson
├── tools/
│   ├── set-cpu-governor.sh
│   └── 50-poc-cpu-governor   # Sudoers snippet
└── speech/
    ├── speech.md             # Scaletta presentazione
    └── presentation.html     # Slide deck self-contained
```

---

## API principali

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/api/notes` | Lista note |
| POST | `/api/audio` | Carica audio → trascrizione asincrona |
| POST | `/api/notes/testo` | Aggiunge nota testuale |
| PATCH | `/api/notes/:id` | Modifica testo/testo_pulito |
| DELETE | `/api/notes/:id` | Elimina nota |
| POST | `/api/pulisci` | Pulizia AI di tutte le note non ancora elaborate |
| POST | `/api/analisi` | Analisi AI (eventi/riassunto/suggerimenti/connessioni) |
| POST | `/api/chat` | Chat (mode: `free` / `notes`) |
| POST | `/api/chat-recap` | Chat sull'analisi con patch JSON |
| GET | `/api/job/:id` | Polling stato job asincrono |
| GET | `/api/archivio` | Lista analisi archiviate |
| POST | `/api/notes/import` | Importa note JSON |
| POST | `/api/notes/:id/retranscribe` | Ri-trascrive audio esistente |
| GET | `/api/config` | Info dispositivo (nome, specs, peers) |

---

## Troubleshooting

**Whisper server non parte**
```bash
tail -f /tmp/whisper_server.log
# Verifica che faster-whisper sia installato:
venv/bin/pip install faster-whisper
```

**llama-server non risponde**
```bash
tail -f /tmp/llama-server.log
curl http://127.0.0.1:8080/health
```

**Porta 3443 già in uso**
```bash
fuser -k 3443/tcp
```

**RAPL non leggibile (metriche watt assenti)**
```bash
sudo chmod o+r /sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj
# Per renderlo permanente: crea una regola udev
```
