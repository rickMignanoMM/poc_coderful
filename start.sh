#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# CPU governor → performance (richiede sudoers installato una volta con:
#   sudo install -m 0440 tools/50-poc-cpu-governor /etc/sudoers.d/)
CURRENT_GOV=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null)
if [ "$CURRENT_GOV" != "performance" ]; then
  echo "Imposto CPU governor a performance..."
  sudo "$DIR/tools/set-cpu-governor.sh" performance || echo "WARN: impossibile impostare il governor (esegui: sudo install -m 0440 tools/50-poc-cpu-governor /etc/sudoers.d/)"
else
  echo "CPU governor già in modalità performance."
fi

# Avvia llama-server (porta 8080) o Ollama (porta 11434) in base ad AI_BASE_URL
AI_BASE_URL_VAL=$(grep "^AI_BASE_URL=" "$DIR/backend/.env" 2>/dev/null | cut -d= -f2-)
if echo "$AI_BASE_URL_VAL" | grep -q ":8080"; then
  if ! curl -s http://127.0.0.1:8080/health 2>/dev/null | grep -q '"ok"'; then
    echo "Avvio llama-server..."
    bash "$DIR/start-llama.sh"
  else
    echo "llama-server già in ascolto su :8080."
  fi
else
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
