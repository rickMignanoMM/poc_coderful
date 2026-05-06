# Deploy su Lightning AI Studios

Guida per far girare poc_coderful su un [Lightning AI Studio](https://lightning.ai) con GPU.

---

## Requisiti GPU

| Modello LLM | GPU minima | VRAM |
|-------------|-----------|------|
| Gemma 4 26B Q4_K_M | **A10G** | 24 GB |
| Gemma 3 4B / 7B | T4 | 16 GB |

> Seleziona la GPU dallo switcher in alto a destra nello Studio prima di avviare.

---

## Setup una-tantum

Apri il terminale nello Studio ed esegui i comandi seguenti. L'ambiente di uno Studio è persistente — bastano una sola volta.

### 1. Clona il repo

```bash
git clone https://github.com/rickMignanoMM/poc_coderful.git
cd poc_coderful
```

### 2. Dipendenze di sistema

```bash
sudo apt-get update -qq
sudo apt-get install -y ffmpeg nodejs npm
```

### 3. Python — Whisper

```bash
python3 -m venv venv
venv/bin/pip install -q faster-whisper
```

### 4. Node — backend e frontend

```bash
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
```

### 5. Certificati SSL

Il backend Node espone anche HTTPS sulla porta 3443. Genera un certificato self-signed:

```bash
cd backend
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 3650 -nodes -subj "/CN=lightning"
cd ..
```

### 6. Installa Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 7. Configura `.env`

```bash
cp backend/.env.example backend/.env
```

Modifica `backend/.env`:

```env
AI_BASE_URL=http://127.0.0.1:11434
AI_MODEL=gemma4:26b

DEVICE_NAME=Lightning AI Studio
DEVICE_SUBTITLE=NVIDIA A10G · Gemma 4 26B
DEVICE_SPECS={"hardware":{"GPU":"NVIDIA A10G","VRAM":"24 GB","RAM":"64 GB"},"ai":{"Modello":"Gemma 4 26B-A4B (MoE)","Quantizzazione":"Q4_K_M","Runtime":"Ollama (CUDA)"}}

PEERS=[]
```

> Per modelli diversi cambia `AI_MODEL` e `DEVICE_SUBTITLE` di conseguenza.

---

## Avvio

```bash
bash start-cloud.sh
```

Lo script:
1. Avvia **Ollama** e scarica il modello al primo run
2. Avvia il **Whisper server** su `:8765`
3. Avvia il **backend Node.js** su `:3000` (HTTP) e `:3443` (HTTPS)

---

## Esponi la porta

Dal pannello Lightning AI, vai su **Ports** e aggiungi la porta `3000`.  
Lightning AI genererà un URL pubblico HTTPS del tipo:

```
https://<studio-id>.lit.ai
```

Apri quell'URL nel browser — l'app è online.

---

## Note

- **Primo avvio lento**: Ollama scarica il modello (~16 GB per Gemma 4 26B) e il Whisper server carica large-v3-turbo. Attendi 2–3 minuti.
- **Modello già scaricato**: Ollama conserva la cache tra sessioni — i run successivi partono in pochi secondi.
- **Metriche di potenza**: sul cloud le metriche watt (RAPL/INA) non sono disponibili. Il badge mostra tok/s ma non i Watt.
- **Peer multipli**: puoi aggiungere altri Studio o backend locali tramite `PEERS` nel `.env`.

---

## Troubleshooting

**Ollama non parte**
```bash
ollama serve &
sleep 3 && ollama list
```

**Whisper server non risponde**
```bash
tail -f /tmp/whisper_server.log
```

**llama/Ollama risponde lentamente**
Verifica che la GPU sia assegnata allo Studio (icona GPU verde in alto a destra). Se la GPU non è attiva, Ollama cade in CPU fallback.

```bash
nvidia-smi   # deve mostrare la GPU
ollama ps    # deve mostrare il modello con "GPU" nella colonna
```
