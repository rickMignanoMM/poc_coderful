#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

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

# Carica modello in memoria (warm-up)
echo "Carico qwen3:14b in memoria..."
curl -s -X POST http://127.0.0.1:11434/api/generate \
  -d '{"model":"qwen3:14b","prompt":"ciao","stream":false}' > /dev/null 2>&1 &

echo "Avvio backend Node.js..."
cd "$DIR/backend"
exec node index.js
