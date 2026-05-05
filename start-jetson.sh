#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Max power mode e clock massimi
echo "Imposto MAXN power mode..."
sudo nvpmodel -m 0
sudo jetson_clocks
echo "Clocks al massimo."

# Variabili Ollama per max performance
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0
export OLLAMA_NUM_PARALLEL=1

# Avvia Ollama se non attivo
if ! curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
  echo "Avvio Ollama..."
  ollama serve &
  for i in $(seq 1 30); do
    sleep 1
    curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1 && break
  done
  echo "Ollama pronto."
else
  echo "Ollama già in ascolto."
fi

# Avvia Whisper server se non attivo
if ! curl -s http://127.0.0.1:8765 > /dev/null 2>&1; then
  echo "Avvio Whisper server..."
  "$DIR/venv/bin/python" "$DIR/whisper_server.py" > /tmp/whisper_server.log 2>&1 &
  WHISPER_PID=$!
  for i in $(seq 1 60); do
    sleep 1
    curl -s http://127.0.0.1:8765 > /dev/null 2>&1 && break
    if ! kill -0 $WHISPER_PID 2>/dev/null; then
      echo "Whisper server crashato. Log:"
      tail -20 /tmp/whisper_server.log
      break
    fi
  done
  echo "Whisper server pronto."
else
  echo "Whisper server già in ascolto."
fi

echo "Avvio backend Node.js..."
cd "$DIR/backend"
exec node index.js
