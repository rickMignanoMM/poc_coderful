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
        <button class="btn-email-recap" @click="showEmailModal = true" title="Invia via mail">📧</button>
        <button class="btn-collapse-panel" @click="$emit('toggle-collapsed')">
          {{ collapsed ? "▼ Espandi" : "▲ Riduci" }}
        </button>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
    </div>

    <!-- Email modal -->
    <div v-if="showEmailModal" class="email-modal-overlay" @click.self="showEmailModal = false">
      <div class="email-modal">
        <div class="email-modal-header">
          <span>📧 Riepilogo</span>
          <button class="close-btn" @click="showEmailModal = false">✕</button>
        </div>

        <div class="email-preview">
          <!-- Header -->
          <div class="ep-header">
            <div class="ep-title">Analisi AI</div>
            <div class="ep-date">{{ formatDate(analysis.generatoIl) }}</div>
          </div>

          <!-- Riassunto -->
          <div v-if="analysis.riassunto" class="ep-section">
            <div class="ep-section-label">📊 Riassunto</div>
            <div v-if="analysis.riassunto.contesto" class="ep-row">
              <span class="ep-key">Contesto</span>
              <span class="ep-val">{{ analysis.riassunto.contesto }}</span>
            </div>
            <div v-if="analysis.riassunto.tono" class="ep-row">
              <span class="ep-key">Tono</span>
              <span class="ep-val">{{ analysis.riassunto.tono }}</span>
            </div>
            <div v-if="analysis.riassunto.argomenti?.length" class="ep-row ep-row-wrap">
              <span class="ep-key">Argomenti</span>
              <div class="ep-tags">
                <span v-for="t in analysis.riassunto.argomenti" :key="t" class="ep-tag">{{ t }}</span>
              </div>
            </div>
            <div v-if="analysis.riassunto.sintesi" class="ep-sintesi">{{ analysis.riassunto.sintesi }}</div>
          </div>

          <!-- Eventi -->
          <div v-if="analysis.eventi?.eventi?.length" class="ep-section">
            <div class="ep-section-label">📅 Eventi & Task</div>
            <div v-for="ev in analysis.eventi.eventi" :key="ev.titolo" class="ep-item">
              <div class="ep-item-top">
                <span class="ep-item-title">{{ ev.titolo }}</span>
                <span v-if="ev.priorita" class="ep-badge" :class="ev.priorita">{{ ev.priorita }}</span>
              </div>
              <div v-if="ev.data" class="ep-item-meta">📆 {{ ev.data }}</div>
              <div v-if="ev.contesto" class="ep-item-meta">{{ ev.contesto }}</div>
            </div>
          </div>

          <!-- Suggerimenti -->
          <div v-if="analysis.suggerimenti?.suggerimenti?.length" class="ep-section">
            <div class="ep-section-label">💡 Suggerimenti</div>
            <div v-for="s in analysis.suggerimenti.suggerimenti" :key="s.titolo" class="ep-item">
              <div class="ep-item-top">
                <span class="ep-item-title">{{ s.titolo }}</span>
                <span v-if="s.priorita" class="ep-badge" :class="s.priorita">{{ s.priorita }}</span>
              </div>
              <div v-if="s.descrizione" class="ep-item-meta">{{ s.descrizione }}</div>
            </div>
          </div>

          <!-- Connessioni -->
          <div v-if="analysis.connessioni?.connessioni?.length" class="ep-section">
            <div class="ep-section-label">🔗 Connessioni tematiche</div>
            <div v-for="c in analysis.connessioni.connessioni" :key="c.tema" class="ep-conn">
              <div class="ep-conn-tema">{{ c.tema }}</div>
              <div v-if="c.descrizione" class="ep-item-meta">{{ c.descrizione }}</div>
              <div v-if="c.note?.length" class="ep-item-meta ep-note-pills">
                <span v-for="n in c.note" :key="n" class="ep-note-pill">{{ n }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="email-modal-actions">
          <button class="btn-copy-email" :class="{ copied: emailCopied }" @click="copyEmailText(analysis)">
            {{ emailCopied ? '✓ Copiato!' : '📋 Copia testo' }}
          </button>
          <button class="btn-mailto" @click="openMailto(analysis)">✉️ Apri nel client mail</button>
        </div>
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
import { ref } from 'vue';

const showEmailModal = ref(false);
const emailCopied = ref(false);

function formatEmailText(analysis) {
  const lines = [];
  const date = analysis.generatoIl
    ? new Date(analysis.generatoIl).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  lines.push(`ANALISI AI — ${date}`);
  lines.push('');

  if (analysis.riassunto) {
    lines.push('RIASSUNTO');
    lines.push('─────────────────────');
    if (analysis.riassunto.contesto) lines.push(`Contesto: ${analysis.riassunto.contesto}`);
    if (analysis.riassunto.tono)     lines.push(`Tono: ${analysis.riassunto.tono}`);
    if (analysis.riassunto.argomenti?.length) lines.push(`Argomenti: ${analysis.riassunto.argomenti.join(', ')}`);
    if (analysis.riassunto.sintesi)  lines.push('', analysis.riassunto.sintesi);
    lines.push('');
  }

  if (analysis.eventi?.eventi?.length) {
    lines.push('EVENTI & TASK');
    lines.push('─────────────────────');
    for (const ev of analysis.eventi.eventi) {
      lines.push(`• ${ev.titolo}${ev.priorita ? ` [${ev.priorita}]` : ''}`);
      if (ev.data)     lines.push(`  Data: ${ev.data}`);
      if (ev.contesto) lines.push(`  ${ev.contesto}`);
    }
    lines.push('');
  }

  if (analysis.suggerimenti?.suggerimenti?.length) {
    lines.push('SUGGERIMENTI');
    lines.push('─────────────────────');
    for (const s of analysis.suggerimenti.suggerimenti) {
      lines.push(`• ${s.titolo}${s.priorita ? ` [${s.priorita}]` : ''}`);
      if (s.descrizione) lines.push(`  ${s.descrizione}`);
    }
    lines.push('');
  }

  if (analysis.connessioni?.connessioni?.length) {
    lines.push('CONNESSIONI TEMATICHE');
    lines.push('─────────────────────');
    for (const c of analysis.connessioni.connessioni) {
      lines.push(`• ${c.tema}`);
      if (c.descrizione)  lines.push(`  ${c.descrizione}`);
      if (c.note?.length) lines.push(`  Note: ${c.note.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('─────────────────────');
  lines.push(`Generato il ${date} · AI locale`);

  return lines.join('\n');
}

async function copyEmailText(analysis) {
  await navigator.clipboard.writeText(formatEmailText(analysis));
  emailCopied.value = true;
  setTimeout(() => { emailCopied.value = false; }, 2000);
}

function openMailto(analysis) {
  const date = analysis.generatoIl
    ? new Date(analysis.generatoIl).toLocaleDateString('it-IT')
    : '';
  const subject = encodeURIComponent(`Analisi AI — ${analysis.riassunto?.contesto || date}`);
  const body = encodeURIComponent(formatEmailText(analysis).slice(0, 1800));
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

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
