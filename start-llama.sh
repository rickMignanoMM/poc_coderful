#!/bin/bash
# Avvia llama-server con Gemma 4 26B-A4B Q4_K_M
LLAMA_DIR="/home/rickmignano/llama-cpp"
MODEL="/usr/share/ollama/.ollama/models/blobs/sha256-b8707e57f676d8dd1b80f623b45200cc92e6966b0e95275e606f412095a49fde"

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
LD_LIBRARY_PATH="$LLAMA_DIR" "$LLAMA_DIR/llama-server" \
  -m "$MODEL" \
  --port 8080 \
  --host 127.0.0.1 \
  --ctx-size 24576 \
  --threads 20 \
  --threads-batch 22 \
  --batch-size 2048 \
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
