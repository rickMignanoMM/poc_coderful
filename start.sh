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

# Avvia ngrok se non attivo
if ! curl -s http://127.0.0.1:4040/api/tunnels > /dev/null 2>&1; then
  echo "Avvio ngrok (obtain-crave-glider.ngrok-free.dev)..."
  ~/.local/bin/ngrok http --url=obtain-crave-glider.ngrok-free.dev 3000 > /tmp/ngrok.log 2>&1 &
  sleep 3
  echo "ngrok avviato."
else
  echo "ngrok già in ascolto."
fi

echo "Avvio backend Node.js..."
cd "$DIR/backend"
exec node index.js
