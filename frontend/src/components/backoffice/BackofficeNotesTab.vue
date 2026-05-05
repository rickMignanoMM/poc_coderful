<template>
  <main class="bo-main">
    <div v-if="loading" class="empty">Caricamento...</div>
    <div v-else-if="groupedByDay.length === 0" class="empty">Nessuna nota trovata.</div>
    <template v-else>
      <div class="note-toolbar">
        <label class="select-all-label">
          <input type="checkbox" class="cb" :checked="allSelected" :indeterminate.prop="someSelected" @change="toggleAll" />
          Seleziona tutto
        </label>
      </div>

      <div class="giorni-list">
        <div v-for="group in groupedByDay" :key="group.dayKey" class="giorno-accordion">
          <button class="giorno-header" :class="{ open: openDays.has(group.dayKey) }" @click="toggleDay(group.dayKey)">
            <span class="giorno-chevron" :class="{ open: openDays.has(group.dayKey) }">›</span>
            <span class="giorno-label">{{ group.dayLabel }}</span>
            <span class="giorno-count">{{ group.notes.length }} {{ group.notes.length !== 1 ? "note" : "nota" }}</span>
          </button>

          <div v-show="openDays.has(group.dayKey)" class="giorno-body">
            <div
              v-for="note in group.notes"
              :key="note.id"
              class="nota-card"
              :class="{ pending: note.status === 'in_elaborazione', selected: selectedIds.has(note.id) }"
            >
              <div class="card-head">
                <div class="card-head-left">
                  <input type="checkbox" class="cb" :checked="selectedIds.has(note.id)" @change="toggleSelect(note.id)" />
                  <span class="card-time">{{ formatTime(note.createdAt) }}</span>
                  <span class="badge" :class="note.status">{{ note.status === "completata" ? "✓ Fatto" : "⏳ In corso" }}</span>
                  <span v-if="note.sentiment?.emoji" class="sent-emoji" :title="note.sentiment?.tono">{{ note.sentiment.emoji }}</span>
                </div>
                <button class="btn-delete" @click="deleteNote(note.id)">✕</button>
              </div>

              <div v-if="note.filename" class="card-audio">
                <audio :src="mediaUrl(`/audio/${note.filename}`)" controls />
              </div>

              <div class="card-text">
                <template v-if="editingId === note.id">
                  <textarea
                    v-model="editingTextModel"
                    class="edit-textarea"
                    rows="3"
                    autofocus
                    @keydown.escape="cancelEdit"
                  />
                  <div class="edit-actions">
                    <button class="btn-save" @click="saveEdit(note)">✓ Salva</button>
                    <button class="btn-cancel" @click="cancelEdit">Annulla</button>
                  </div>
                </template>

                <template v-else>
                  <div class="text-row">
                    <span>
                      <span v-if="note.testo_pulito" class="label-pulito">✨</span>
                      <span :class="{ 'text-clamped': !expandedIds.has(note.id) }">{{ note.testo_pulito || note.testo || "" }}</span>
                      <span v-if="note.status === 'in_elaborazione'" class="muted">In trascrizione...</span>
                      <span v-else-if="!note.testo" class="muted">
                        Nessun testo trascritto.
                        <button v-if="note.filename" class="btn-retranscribe" :disabled="retranscribingIds.has(note.id)" @click.stop="retranscribe(note)">
                          {{ retranscribingIds.has(note.id) ? "⏳ Avvio..." : "🔄 Rielabora" }}
                        </button>
                      </span>
                      <button v-if="note.testo" class="btn-expand" @click.stop="toggleExpand(note.id)">
                        {{ expandedIds.has(note.id) ? "mostra meno ▲" : "mostra tutto ▼" }}
                      </button>
                    </span>
                    <button v-if="note.testo" class="btn-edit" @click="startEdit(note)">✏️</button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>

<script setup>
defineProps({
  loading: { type: Boolean, default: false },
  groupedByDay: { type: Array, required: true },
  openDays: { type: Object, required: true },
  allSelected: { type: Boolean, default: false },
  someSelected: { type: Boolean, default: false },
  selectedIds: { type: Object, required: true },
  editingId: { type: [Number, String], default: null },
  expandedIds: { type: Object, required: true },
  retranscribingIds: { type: Object, required: true },
  formatTime: { type: Function, required: true },
  mediaUrl: { type: Function, required: true },
  toggleAll: { type: Function, required: true },
  toggleDay: { type: Function, required: true },
  toggleSelect: { type: Function, required: true },
  deleteNote: { type: Function, required: true },
  cancelEdit: { type: Function, required: true },
  saveEdit: { type: Function, required: true },
  startEdit: { type: Function, required: true },
  toggleExpand: { type: Function, required: true },
  retranscribe: { type: Function, required: true },
});

const editingTextModel = defineModel("editingText", { type: String, default: "" });
</script>

<style scoped src="../../styles/backoffice/notes-tab.css"></style>
