<template>
  <div class="analisi-panel">
    <div class="analisi-header">
      <div class="analisi-header-left">
        <span>🤖 Analisi AI — {{ formatDate(analysis.generatoIl) }}</span>
        <span v-if="analysis.power" class="power-badge" :title="`${analysis.power.joules} J totali`">
          ⚡ {{ analysis.power.watts }} W · {{ analysis.power.tokPerSec }} tok/s · {{ analysis.power.elapsed }}s
        </span>
      </div>
      <div class="analisi-header-actions">
        <button class="btn-collapse-panel" @click="$emit('toggle-collapsed')">
          {{ collapsed ? "▼ Espandi" : "▲ Riduci" }}
        </button>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
    </div>

    <div v-show="!collapsed" class="analisi-cards">
      <div v-if="analysis.eventi" class="acard">
        <h3>📅 Eventi & Task</h3>
        <div v-if="!analysis.eventi?.eventi?.length" class="acard-empty">Nessun evento rilevato</div>
        <div v-else class="eventi-list">
          <div v-for="(eventItem, idx) in analysis.eventi.eventi" :key="idx" class="evento">
            <template v-if="editingEventIdx === idx">
              <input v-model="editingEventModel.titolo" class="ev-input" placeholder="Titolo" />
              <input v-model="editingEventModel.data" class="ev-input" placeholder="Data (es. 15 maggio 2026 ore 10:00)" />
              <input v-model="editingEventModel.contesto" class="ev-input" placeholder="Contesto" />
              <select v-model="editingEventModel.priorita" class="ev-select">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
              <div class="ev-edit-actions">
                <button class="btn-save" @click="saveEventEdit">✓ Salva</button>
                <button class="btn-cancel" @click="cancelEventEdit">Annulla</button>
              </div>
            </template>
            <template v-else>
              <div class="evento-header">
                <span class="evento-titolo">{{ eventItem.titolo }}</span>
                <div class="evento-header-right">
                  <span class="badge-prio" :class="eventItem.priorita">{{ eventItem.priorita }}</span>
                  <button class="btn-ev-edit" @click="startEventEdit(eventItem, idx)" title="Modifica">✏️</button>
                  <a :href="buildCalendarUrl(eventItem)" target="_blank" rel="noopener" class="btn-gcal" title="Aggiungi a Google Calendar">📅</a>
                </div>
              </div>
              <div v-if="eventItem.data" class="evento-meta">📆 {{ eventItem.data }}</div>
              <div v-if="eventItem.contesto" class="evento-meta">{{ eventItem.contesto }}</div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="analysis.riassunto" class="acard">
        <div class="acard-title-row">
          <h3>📊 Riassunto</h3>
          <button v-if="!editingSummaryModel" class="btn-acard-edit" @click="startSummaryEdit">✏️</button>
        </div>
        <template v-if="editingSummaryModel">
          <div class="rv-field"><label>Contesto</label><input v-model="editingSummaryValModel.contesto" class="ev-input" /></div>
          <div class="rv-field"><label>Tono</label><input v-model="editingSummaryValModel.tono" class="ev-input" /></div>
          <div class="rv-field"><label>Argomenti (uno per riga)</label><textarea v-model="editingSummaryValModel.argomenti" class="ev-input rv-textarea" rows="3" /></div>
          <div class="rv-field"><label>Sintesi</label><textarea v-model="editingSummaryValModel.sintesi" class="ev-input rv-textarea" rows="3" /></div>
          <div class="ev-edit-actions">
            <button class="btn-save" @click="saveSummary">✓ Salva</button>
            <button class="btn-cancel" @click="editingSummaryModel = false">Annulla</button>
          </div>
        </template>
        <template v-else>
          <div class="riassunto">
            <div class="riassunto-row"><strong>Contesto:</strong> {{ analysis.riassunto?.contesto }}</div>
            <div class="riassunto-row"><strong>Tono:</strong> {{ analysis.riassunto?.tono }}</div>
            <div class="riassunto-row">
              <strong>Argomenti:</strong>
              <div class="tags">
                <span v-for="topic in analysis.riassunto?.argomenti" :key="topic" class="tag">{{ topic }}</span>
              </div>
            </div>
            <div class="riassunto-row sintesi">{{ analysis.riassunto?.sintesi }}</div>
          </div>
        </template>
      </div>

      <div v-if="analysis.suggerimenti" class="acard">
        <h3>💡 Suggerimenti</h3>
        <div v-if="!analysis.suggerimenti?.suggerimenti?.length" class="acard-empty">Nessun suggerimento</div>
        <div v-else class="suggerimenti-list">
          <div v-for="(suggestion, idx) in analysis.suggerimenti.suggerimenti" :key="idx" class="suggerimento">
            <template v-if="editingSuggestionIdx === idx">
              <input v-model="editingSuggestionModel.titolo" class="ev-input" placeholder="Titolo" />
              <textarea v-model="editingSuggestionModel.descrizione" class="ev-input rv-textarea" rows="2" placeholder="Descrizione" />
              <select v-model="editingSuggestionModel.priorita" class="ev-select">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
              <div class="ev-edit-actions">
                <button class="btn-save" @click="saveSuggestion">✓ Salva</button>
                <button class="btn-cancel" @click="editingSuggestionIdx = null">Annulla</button>
              </div>
            </template>
            <template v-else>
              <div class="sug-header">
                <span class="sug-titolo">{{ suggestion.titolo }}</span>
                <div class="sug-header-right">
                  <span class="badge-prio" :class="suggestion.priorita">{{ suggestion.priorita }}</span>
                  <button class="btn-ev-edit" @click="startSuggestionEdit(suggestion, idx)">✏️</button>
                </div>
              </div>
              <div class="sug-desc">{{ suggestion.descrizione }}</div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="analysis.connessioni" class="acard acard-full">
        <h3>🔗 Connessioni tematiche</h3>
        <div v-if="!analysis.connessioni?.connessioni?.length" class="acard-empty">Nessuna connessione significativa rilevata</div>
        <div v-else class="connessioni-list">
          <div v-for="(connection, idx) in analysis.connessioni.connessioni" :key="idx" class="connessione">
            <template v-if="editingConnectionIdx === idx">
              <div class="rv-field"><label>Tema</label><input v-model="editingConnectionModel.tema" class="ev-input" /></div>
              <div class="rv-field"><label>Descrizione</label><textarea v-model="editingConnectionModel.descrizione" class="ev-input rv-textarea" rows="2" /></div>
              <div class="rv-field"><label>Note collegate (una per riga)</label><textarea v-model="editingConnectionModel.note" class="ev-input rv-textarea" rows="2" /></div>
              <div class="ev-edit-actions">
                <button class="btn-save" @click="saveConnection">✓ Salva</button>
                <button class="btn-cancel" @click="editingConnectionIdx = null">Annulla</button>
              </div>
            </template>
            <template v-else>
              <div class="conn-header">
                <div class="conn-tema">{{ connection.tema }}</div>
                <button class="btn-ev-edit" @click="startConnectionEdit(connection, idx)">✏️</button>
              </div>
              <div class="conn-desc">{{ connection.descrizione }}</div>
              <div v-if="connection.note?.length" class="conn-note">{{ connection.note.join(" · ") }}</div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  analysis: { type: Object, required: true },
  collapsed: { type: Boolean, default: false },
  formatDate: { type: Function, required: true },
  buildCalendarUrl: { type: Function, required: true },
  startSummaryEdit: { type: Function, required: true },
  saveSummary: { type: Function, required: true },
  startEventEdit: { type: Function, required: true },
  saveEventEdit: { type: Function, required: true },
  cancelEventEdit: { type: Function, required: true },
  startSuggestionEdit: { type: Function, required: true },
  saveSuggestion: { type: Function, required: true },
  startConnectionEdit: { type: Function, required: true },
  saveConnection: { type: Function, required: true },
});

defineEmits(["toggle-collapsed", "close"]);

const editingEventIdx = defineModel("editingEventIdx", { type: Number, default: null });
const editingEventModel = defineModel("editingEvent", { type: Object, default: () => ({}) });
const editingSummaryModel = defineModel("editingSummary", { type: Boolean, default: false });
const editingSummaryValModel = defineModel("editingSummaryVal", { type: Object, default: () => ({}) });
const editingSuggestionIdx = defineModel("editingSuggestionIdx", { type: Number, default: null });
const editingSuggestionModel = defineModel("editingSuggestion", { type: Object, default: () => ({}) });
const editingConnectionIdx = defineModel("editingConnectionIdx", { type: Number, default: null });
const editingConnectionModel = defineModel("editingConnection", { type: Object, default: () => ({}) });
</script>

<style scoped src="../../styles/backoffice/analysis-panel.css"></style>
