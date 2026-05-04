<template>
  <div class="notes-view">
    <div class="toolbar">
      <span class="count">{{ notes.length }} {{ notes.length === 1 ? "nota" : "note" }}</span>
      <button class="refresh-btn" @click="carica" :disabled="loading">↻</button>
    </div>

    <div v-if="loading" class="empty">Caricamento...</div>
    <div v-else-if="notes.length === 0" class="empty">Nessuna nota ancora.<br>Registra la prima!</div>

    <div v-else class="list">
      <div v-for="nota in notes" :key="nota.id" class="note-card">
        <div class="note-header">
          <div>
            <div class="note-date">{{ formatDate(nota.createdAt) }}</div>
            <div class="note-status" :class="nota.status">
              {{ nota.status === "completata" ? "✓ Trascritto" : "⏳ In elaborazione..." }}
            </div>
          </div>
          <button class="delete-btn" @click="elimina(nota.id)">✕</button>
        </div>

        <audio v-if="nota.filename" :src="mediaUrl(`/audio/${nota.filename}`)" controls />

        <p v-if="nota.testo" class="note-text">{{ nota.testo }}</p>
        <p v-else-if="nota.status === 'in_elaborazione'" class="note-text placeholder">
          La trascrizione è in corso...
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useApi } from "../composables/useApi.js";

const { apiFetch, mediaUrl } = useApi();

const notes = ref([]);
const loading = ref(true);
let pollInterval = null;

async function carica(mostraLoading = true) {
  if (mostraLoading) loading.value = true;
  try {
    const res = await apiFetch("/api/notes");
    notes.value = await res.json();
  } finally {
    if (mostraLoading) loading.value = false;
  }
  // smetti di fare polling se non ci sono note in elaborazione
  const hasPending = notes.value.some((n) => n.status === "in_elaborazione");
  if (!hasPending && pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  } else if (hasPending && !pollInterval) {
    pollInterval = setInterval(() => carica(false), 4000);
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

async function elimina(id) {
  await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
  notes.value = notes.value.filter((n) => n.id !== id);
}

onMounted(() => {
  carica();
});

onUnmounted(() => clearInterval(pollInterval));
</script>

<style scoped>
.notes-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.count { color: #8e8e93; font-size: 14px; }

.refresh-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #007aff;
  cursor: pointer;
  padding: 4px 8px;
}

.empty {
  text-align: center;
  color: #8e8e93;
  padding: 60px 20px;
  line-height: 1.6;
}

.list { display: flex; flex-direction: column; gap: 12px; }

.note-card {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.note-date { font-size: 13px; color: #8e8e93; }

.note-status {
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
}

.note-status.completata { color: #34c759; }
.note-status.in_elaborazione { color: #ff9500; }

.delete-btn {
  background: none;
  border: none;
  color: #c7c7cc;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
}

audio { width: 100%; }

.note-text {
  font-size: 15px;
  line-height: 1.5;
  color: #1d1d1f;
}

.note-text.placeholder { color: #c7c7cc; font-style: italic; }
</style>
