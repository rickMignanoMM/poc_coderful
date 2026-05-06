#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

# Ollama
if ! curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
  echo "Avvio Ollama..."
  ollama serve > /tmp/ollama.log 2>&1 &
  for i in $(seq 1 30); do
    sleep 1
    curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1 && break
  done
  echo "  → Ollama pronto"
else
  echo "Ollama già in ascolto."
fi

MODEL=$(grep '^AI_MODEL=' "$DIR/backend/.env" 2>/dev/null | cut -d= -f2)
MODEL="${MODEL:-gemma4:26b}"
if ! ollama list | grep -q "^${MODEL}"; then
  echo "Scarico modello ${MODEL}..."
  ollama pull "$MODEL"
  echo "  → Modello scaricato"
else
  echo "Modello ${MODEL} già presente."
fi

# Whisper server
if ! curl -s http://127.0.0.1:8765 > /dev/null 2>&1; then
  echo "Avvio Whisper server..."
  "$DIR/venv/bin/python" "$DIR/whisper_server.py" > /tmp/whisper_server.log 2>&1 &
  WHISPER_PID=$!
  for i in $(seq 1 60); do
    sleep 2
    curl -s http://127.0.0.1:8765 > /dev/null 2>&1 && break
    echo "  → attendo modello Whisper ($((i*2))s)..."
    if ! kill -0 $WHISPER_PID 2>/dev/null; then
      echo "Whisper server crashato. Log:"
      tail -20 /tmp/whisper_server.log
      break
    fi
  done
  echo "  → Whisper server pronto"
else
  echo "Whisper server già in ascolto."
fi

echo "Avvio backend Node.js..."
cd "$DIR/backend"
exec node index.js
