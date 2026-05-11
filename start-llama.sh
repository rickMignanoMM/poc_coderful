#!/bin/bash
# Avvia llama-server con Gemma 4 26B-A4B Q4_K_M
LLAMA_DIR="/home/rickmignano/llama-cpp"
MODEL="/home/rickmignano/models/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf"

if fuser 8080/tcp > /dev/null 2>&1; then
  echo "llama-server già in ascolto su :8080"
  exit 0
fi

if [ ! -f "$LLAMA_DIR/llama-server" ]; then
  echo "ERRORE: llama-server non trovato in $LLAMA_DIR"
  echo "Riesegui il download del binario llama.cpp."
  exit 1
fi

echo "Avvio llama-server (Gemma 4 26B-A4B)..."
# Pinna ai soli P-core (0-11: 6 fisici × 2 HT)
# Gli E-core (12-19) e LP E-core (20-21) creano stragglers nell'inferenza
export LD_LIBRARY_PATH="$LLAMA_DIR"
taskset -c 0-11 "$LLAMA_DIR/llama-server" \
  -m "$MODEL" \
  --port 8080 \
  --host 127.0.0.1 \
  --ctx-size 24576 \
  --parallel 1 \
  --threads 12 \
  --threads-batch 12 \
  --batch-size 512 \
  --mlock \
  --reasoning off \
  --flash-attn on \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  > /tmp/llama-server.log 2>&1 &

echo "PID=$!"
echo "Log: tail -f /tmp/llama-server.log"

# Aspetta fino a 60s che il server sia pronto
for i in $(seq 1 60); do
  sleep 1
  if curl -s http://127.0.0.1:8080/health | grep -q '"ok"'; then
    echo "Server pronto in ${i}s"
    exit 0
  fi
done
echo "TIMEOUT: server non pronto dopo 60s, controlla /tmp/llama-server.log"
exit 1
