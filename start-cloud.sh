#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

OLLAMA_API_URL="http://127.0.0.1:11434"
OLLAMA_BIN=""
WHISPER_START_TIMEOUT="${WHISPER_START_TIMEOUT:-180}"
WHISPER_HEALTHCHECK_TIMEOUT="${WHISPER_HEALTHCHECK_TIMEOUT:-2}"

read_backend_env() {
  local key="$1"
  local default_value="$2"
  local value

  value=$(grep "^${key}=" "$DIR/backend/.env" 2>/dev/null | head -n 1 | cut -d= -f2-)
  if [ -n "$value" ]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$default_value"
  fi
}

find_ollama_bin() {
  if [ -n "$OLLAMA_BIN" ] && [ -x "$OLLAMA_BIN" ]; then
    return 0
  fi

  if command -v ollama > /dev/null 2>&1; then
    OLLAMA_BIN="$(command -v ollama)"
    return 0
  fi

  for candidate in /usr/local/bin/ollama /usr/bin/ollama "$HOME/.local/bin/ollama"; do
    if [ -x "$candidate" ]; then
      OLLAMA_BIN="$candidate"
      return 0
    fi
  done

  return 1
}

ollama_ready() {
  curl -s "$OLLAMA_API_URL/api/tags" > /dev/null 2>&1
}

ollama_model_present() {
  curl -s "$OLLAMA_API_URL/api/tags" | grep -Fq "\"name\":\"${MODEL}\""
}

whisper_ready() {
  curl -s --max-time "$WHISPER_HEALTHCHECK_TIMEOUT" "$WHISPER_URL" > /dev/null 2>&1
}

print_whisper_log_tail() {
  if [ -f /tmp/whisper_server_cloud.log ]; then
    tail -n 5 /tmp/whisper_server_cloud.log
  else
    echo "(log Whisper non ancora creato)"
  fi
}

find_whisper_pid() {
  if ! command -v pgrep > /dev/null 2>&1; then
    return 1
  fi

  pgrep -f "$DIR/whisper_server_cloud.py" | head -n 1
}

whisper_uses_transformers() {
  case "$WHISPER_MODEL" in
    large-v3-turbo|whisper-large-v3-turbo|openai/whisper-*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

python_modules_available() {
  python - "$@" <<'PY'
import importlib.util
import sys

missing = [module for module in sys.argv[1:] if importlib.util.find_spec(module) is None]
if missing:
    print("\n".join(missing))
    sys.exit(1)
PY
}

ensure_whisper_dependencies() {
  local modules
  local packages

  if whisper_uses_transformers; then
    modules=(transformers accelerate safetensors)
    packages=(transformers accelerate safetensors)
  else
    modules=(faster_whisper)
    packages=(faster-whisper)
  fi

  if python_modules_available "${modules[@]}" > /dev/null 2>&1; then
    return 0
  fi

  echo "Installo dipendenze Python per Whisper (${WHISPER_MODEL})..."
  python -m pip install -q "${packages[@]}"
  echo "  → Dipendenze Whisper pronte"
}

ensure_backend_dependencies() {
  if [ -d "$DIR/backend/node_modules/dotenv" ]; then
    return 0
  fi

  if ! command -v npm > /dev/null 2>&1; then
    echo "ERRORE: npm non trovato. Installa Node.js e npm prima di avviare il backend."
    exit 1
  fi

  echo "Installo dipendenze backend..."
  (
    cd "$DIR/backend"
    npm install
  )
  echo "  → Dipendenze backend pronte"
}

# Ollama
if ! ollama_ready; then
  if ! find_ollama_bin; then
    echo "ERRORE: Ollama non è in esecuzione e il binario 'ollama' non è disponibile."
    echo "Installa Ollama oppure avvialo fuori da questo script, poi riprova."
    exit 1
  fi

  echo "Avvio Ollama..."
  "$OLLAMA_BIN" serve > /tmp/ollama.log 2>&1 &
  for i in $(seq 1 30); do
    sleep 1
    ollama_ready && break
  done

  if ! ollama_ready; then
    echo "ERRORE: Ollama non risponde su :11434. Log:"
    tail -20 /tmp/ollama.log || true
    exit 1
  fi

  echo "  → Ollama pronto"
else
  echo "Ollama già in ascolto."
fi

MODEL="$(read_backend_env AI_MODEL gemma4:26b)"
if ! ollama_model_present; then
  echo "Scarico modello ${MODEL}..."

  if find_ollama_bin; then
    "$OLLAMA_BIN" pull "$MODEL"
  else
    curl -fsS "$OLLAMA_API_URL/api/pull" \
      -H 'Content-Type: application/json' \
      -d "{\"model\":\"${MODEL}\",\"stream\":false}" > /tmp/ollama-pull.log
  fi

  if ! ollama_model_present; then
    echo "ERRORE: il modello ${MODEL} non risulta disponibile dopo il download."
    [ -f /tmp/ollama-pull.log ] && tail -20 /tmp/ollama-pull.log
    exit 1
  fi

  echo "  → Modello scaricato"
else
  echo "Modello ${MODEL} già presente."
fi

WHISPER_PORT="$(read_backend_env WHISPER_PORT 8765)"
WHISPER_MODEL="$(read_backend_env WHISPER_MODEL small)"
WHISPER_URL="http://127.0.0.1:${WHISPER_PORT}"
export WHISPER_PORT WHISPER_MODEL
echo "Whisper config: model=${WHISPER_MODEL}, port=${WHISPER_PORT}, timeout=${WHISPER_START_TIMEOUT}s, log=/tmp/whisper_server_cloud.log"
ensure_whisper_dependencies

# Whisper server
if ! whisper_ready; then
  EXISTING_WHISPER_PID="$(find_whisper_pid || true)"

  if [ -n "$EXISTING_WHISPER_PID" ]; then
    WHISPER_PID="$EXISTING_WHISPER_PID"
    echo "Whisper server già in avvio (PID $WHISPER_PID), attendo che diventi pronto..."
    echo "Ultime righe log Whisper:"
    print_whisper_log_tail
  else
    echo "Avvio Whisper server (${WHISPER_MODEL})..."
    python "$DIR/whisper_server_cloud.py" > /tmp/whisper_server_cloud.log 2>&1 &
    WHISPER_PID=$!
    echo "Whisper PID: $WHISPER_PID"
  fi

  for i in $(seq 1 "$WHISPER_START_TIMEOUT"); do
    sleep 1
    whisper_ready && break
    echo "  → attendo modello Whisper ${WHISPER_MODEL} (${i}s)..."
    if [ $((i % 10)) -eq 0 ]; then
      echo "  → ultime righe log Whisper (${i}s):"
      print_whisper_log_tail
    fi
    if ! kill -0 "$WHISPER_PID" 2>/dev/null; then
      echo "ERRORE: Whisper server crashato. Log:"
      tail -20 /tmp/whisper_server_cloud.log || true
      exit 1
    fi
  done

  if ! whisper_ready; then
    echo "ERRORE: Whisper server ${WHISPER_MODEL} non pronto dopo ${WHISPER_START_TIMEOUT}s. Log:"
    tail -20 /tmp/whisper_server_cloud.log || true
    exit 1
  fi

  echo "  → Whisper server pronto"
else
  echo "Whisper server già in ascolto."
fi

echo "Avvio backend Node.js..."
ensure_backend_dependencies
cd "$DIR/backend"
exec node index.js
