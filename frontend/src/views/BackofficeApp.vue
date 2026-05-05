<template>
  <div class="bo">
    <header class="bo-header">
      <h1>📋 Backoffice Note Audio</h1>
      <div class="header-right">
        <input v-model="search" class="search" placeholder="Cerca nelle trascrizioni..." />
        <button class="btn-pulisci" :disabled="cleanupLoading || analysisLoading" @click="startCleanup">
          {{ cleanupLoading ? "⏳ Pulizia in corso..." : "✨ Sistema note" }}
        </button>

        <div v-if="selectedIds.size > 0" class="sel-badge">
          {{ selectedIds.size }} selezionat{{ selectedIds.size === 1 ? 'a' : 'e' }}
          <button class="sel-clear" @click="selectedIds.clear(); selectedIds = new Set(selectedIds)">✕</button>
        </div>

        <div class="analisi-split" v-click-outside="() => analysisMenuOpen = false">
          <button class="btn-analisi" :disabled="analysisLoading || cleanupLoading" @click="startAnalysis('tutto')">
            {{ analysisLoading ? "⏳ Analisi..." : selectedIds.size > 0 ? `🧠 Analizza (${selectedIds.size})` : "🧠 Analizza" }}
          </button>
          <button class="btn-analisi-arrow" :disabled="analysisLoading || cleanupLoading" @click.stop="analysisMenuOpen = !analysisMenuOpen">▾</button>
          <div v-if="analysisMenuOpen" class="analisi-dropdown">
            <button @click="startAnalysis('eventi')">📅 Solo eventi e task</button>
            <button @click="startAnalysis('riassunto')">📊 Solo riassunto</button>
            <button @click="startAnalysis('suggerimenti')">💡 Solo suggerimenti</button>
            <button @click="startAnalysis('connessioni')">🔗 Solo connessioni</button>
          </div>
        </div>

        <button class="btn-testo" :class="{ active: textInputOpen }" @click="textInputOpen = !textInputOpen" title="Aggiungi nota testuale">📝</button>
        <button class="btn-refresh" @click="loadNotes">↻</button>
      </div>
    </header>

    <transition name="slide">
      <div v-if="textInputOpen" class="testo-panel">
        <textarea
          v-model="textInput"
          class="testo-area"
          placeholder="Incolla o scrivi il testo della nota..."
          rows="4"
          autofocus
          @keydown.meta.enter="addTextNote"
          @keydown.ctrl.enter="addTextNote"
        />
        <div class="testo-actions">
          <button class="btn-save" :disabled="!textInput.trim()" @click="addTextNote">✓ Aggiungi nota</button>
          <button class="btn-cancel" @click="textInputOpen = false; textInput = ''">Annulla</button>
          <span class="testo-hint">⌘↵ per salvare</span>
        </div>
      </div>
    </transition>

    <nav class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'note' }]" @click="activeTab = 'note'">📋 Note</button>
      <button :class="['tab-btn', { active: activeTab === 'stats' }]" @click="activeTab = 'stats'">📊 Stats</button>
      <button :class="['tab-btn', { active: activeTab === 'archivio' }]" @click="activeTab = 'archivio'; loadArchive()">📁 Archivio</button>
      <button :class="['tab-btn', { active: activeTab === 'chat' }]" @click="activeTab = 'chat'">💬 Chat</button>
    </nav>

    <transition name="slide">
      <div v-if="analysis" class="analisi-panel">
        <div class="analisi-header">
          <div class="analisi-header-left">
            <span>🤖 Analisi AI — {{ formatDate(analysis.generatoIl) }}</span>
            <span v-if="analysis.power" class="power-badge" :title="`${analysis.power.joules} J in ${analysis.power.elapsed}s`">
              ⚡ {{ analysis.power.watts }} W
            </span>
          </div>
          <div class="analisi-header-actions">
            <button class="btn-collapse-panel" @click="analysisCollapsed = !analysisCollapsed">
              {{ analysisCollapsed ? '▼ Espandi' : '▲ Riduci' }}
            </button>
            <button class="close-btn" @click="analysis = null">✕</button>
          </div>
        </div>

        <div v-show="!analysisCollapsed" class="analisi-cards">

          <!-- EVENTI -->
          <div v-if="analysis.eventi" class="acard">
            <h3>📅 Eventi & Task</h3>
            <div v-if="!analysis.eventi?.eventi?.length" class="acard-empty">Nessun evento rilevato</div>
            <div v-else class="eventi-list">
              <div v-for="(ev, idx) in analysis.eventi.eventi" :key="idx" class="evento">
                <template v-if="editingEventIdx === idx">
                  <input v-model="editingEvent.titolo" class="ev-input" placeholder="Titolo" />
                  <input v-model="editingEvent.data" class="ev-input" placeholder="Data (es. 15 maggio 2026 ore 10:00)" />
                  <input v-model="editingEvent.contesto" class="ev-input" placeholder="Contesto" />
                  <select v-model="editingEvent.priorita" class="ev-select">
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
                    <span class="evento-titolo">{{ ev.titolo }}</span>
                    <div class="evento-header-right">
                      <span class="badge-prio" :class="ev.priorita">{{ ev.priorita }}</span>
                      <button class="btn-ev-edit" @click="startEventEdit(ev, idx)" title="Modifica">✏️</button>
                      <a :href="buildCalendarUrl(ev)" target="_blank" rel="noopener" class="btn-gcal" title="Aggiungi a Google Calendar">📅</a>
                    </div>
                  </div>
                  <div v-if="ev.data" class="evento-meta">📆 {{ ev.data }}</div>
                  <div v-if="ev.contesto" class="evento-meta">{{ ev.contesto }}</div>
                </template>
              </div>
            </div>
          </div>

          <!-- RIASSUNTO -->
          <div v-if="analysis.riassunto" class="acard">
            <div class="acard-title-row">
              <h3>📊 Riassunto</h3>
              <button v-if="!editingSummary" class="btn-acard-edit" @click="startSummaryEdit">✏️</button>
            </div>
            <template v-if="editingSummary">
              <div class="rv-field"><label>Contesto</label><input v-model="editingSummaryVal.contesto" class="ev-input" /></div>
              <div class="rv-field"><label>Tono</label><input v-model="editingSummaryVal.tono" class="ev-input" /></div>
              <div class="rv-field"><label>Argomenti (uno per riga)</label><textarea v-model="editingSummaryVal.argomenti" class="ev-input rv-textarea" rows="3" /></div>
              <div class="rv-field"><label>Sintesi</label><textarea v-model="editingSummaryVal.sintesi" class="ev-input rv-textarea" rows="3" /></div>
              <div class="ev-edit-actions">
                <button class="btn-save" @click="saveSummary">✓ Salva</button>
                <button class="btn-cancel" @click="editingSummary = false">Annulla</button>
              </div>
            </template>
            <template v-else>
              <div class="riassunto">
                <div class="riassunto-row"><strong>Contesto:</strong> {{ analysis.riassunto?.contesto }}</div>
                <div class="riassunto-row"><strong>Tono:</strong> {{ analysis.riassunto?.tono }}</div>
                <div class="riassunto-row">
                  <strong>Argomenti:</strong>
                  <div class="tags">
                    <span v-for="a in analysis.riassunto?.argomenti" :key="a" class="tag">{{ a }}</span>
                  </div>
                </div>
                <div class="riassunto-row sintesi">{{ analysis.riassunto?.sintesi }}</div>
              </div>
            </template>
          </div>

          <!-- SUGGERIMENTI -->
          <div v-if="analysis.suggerimenti" class="acard">
            <h3>💡 Suggerimenti</h3>
            <div v-if="!analysis.suggerimenti?.suggerimenti?.length" class="acard-empty">Nessun suggerimento</div>
            <div v-else class="suggerimenti-list">
              <div v-for="(s, idx) in analysis.suggerimenti.suggerimenti" :key="idx" class="suggerimento">
                <template v-if="editingSuggestionIdx === idx">
                  <input v-model="editingSuggestion.titolo" class="ev-input" placeholder="Titolo" />
                  <textarea v-model="editingSuggestion.descrizione" class="ev-input rv-textarea" rows="2" placeholder="Descrizione" />
                  <select v-model="editingSuggestion.priorita" class="ev-select">
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
                    <span class="sug-titolo">{{ s.titolo }}</span>
                    <div style="display:flex;gap:6px;align-items:center">
                      <span class="badge-prio" :class="s.priorita">{{ s.priorita }}</span>
                      <button class="btn-ev-edit" @click="startSuggestionEdit(s, idx)">✏️</button>
                    </div>
                  </div>
                  <div class="sug-desc">{{ s.descrizione }}</div>
                </template>
              </div>
            </div>
          </div>

          <!-- CONNESSIONI -->
          <div v-if="analysis.connessioni" class="acard acard-full">
            <h3>🔗 Connessioni tematiche</h3>
            <div v-if="!analysis.connessioni?.connessioni?.length" class="acard-empty">Nessuna connessione significativa rilevata</div>
            <div v-else class="connessioni-list">
              <div v-for="(c, idx) in analysis.connessioni.connessioni" :key="idx" class="connessione">
                <template v-if="editingConnectionIdx === idx">
                  <div class="rv-field"><label>Tema</label><input v-model="editingConnection.tema" class="ev-input" /></div>
                  <div class="rv-field"><label>Descrizione</label><textarea v-model="editingConnection.descrizione" class="ev-input rv-textarea" rows="2" /></div>
                  <div class="rv-field"><label>Note collegate (una per riga)</label><textarea v-model="editingConnection.note" class="ev-input rv-textarea" rows="2" /></div>
                  <div class="ev-edit-actions">
                    <button class="btn-save" @click="saveConnection">✓ Salva</button>
                    <button class="btn-cancel" @click="editingConnectionIdx = null">Annulla</button>
                  </div>
                </template>
                <template v-else>
                  <div class="conn-header">
                    <div class="conn-tema">{{ c.tema }}</div>
                    <button class="btn-ev-edit" @click="startConnectionEdit(c, idx)">✏️</button>
                  </div>
                  <div class="conn-desc">{{ c.descrizione }}</div>
                  <div v-if="c.note?.length" class="conn-note">{{ c.note.join(" · ") }}</div>
                </template>
              </div>
            </div>
          </div>

        </div>
      </div>
    </transition>

    <div v-if="isAnyLoading || activeLogs.length || activeStreaming" ref="logPanel" class="log-panel">
      <div v-if="isAnyLoading && !activeLogs.length && !activeStreaming" class="log-waiting">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="log-waiting-text">AI sta elaborando...</span>
      </div>
      <div class="log-line" v-for="(line, i) in activeLogs" :key="i">
        <span v-if="line.startsWith('[')" class="log-meta">{{ line.match(/^\[.*?\]/)?.[0] }}</span>
        <span class="log-msg">▶ {{ line.startsWith('[') ? line.replace(/^\[.*?\]\s*/, '') : line }}</span>
      </div>
      <div v-if="activeStreaming" class="log-streaming">
        <span class="log-streaming-label">💭</span>
        <span class="log-streaming-text">{{ chatLoading ? 'Rispondo...' : cleanupLoading ? 'Rielaborando...' : 'Analizzando...' }}<span class="log-cursor">▋</span></span>
      </div>
    </div>

    <div v-if="analysisError" class="error-bar">⚠️ {{ analysisError }}</div>

    <!-- NOTE LIST -->
    <main v-if="activeTab === 'note'" class="bo-main">
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
          <div v-for="gruppo in groupedByDay" :key="gruppo.dayKey" class="giorno-accordion">
            <button
              class="giorno-header"
              :class="{ open: openDays.has(gruppo.dayKey) }"
              @click="toggleDay(gruppo.dayKey)"
            >
              <span class="giorno-chevron" :class="{ open: openDays.has(gruppo.dayKey) }">›</span>
              <span class="giorno-label">{{ gruppo.dayLabel }}</span>
              <span class="giorno-count">{{ gruppo.notes.length }} {{ gruppo.notes.length !== 1 ? 'note' : 'nota' }}</span>
            </button>
            <div v-show="openDays.has(gruppo.dayKey)" class="giorno-body">
              <div
                v-for="nota in gruppo.notes"
                :key="nota.id"
                class="nota-card"
                :class="{ pending: nota.status === 'in_elaborazione', selected: selectedIds.has(nota.id) }"
              >
                <div class="card-head">
                  <div class="card-head-left">
                    <input type="checkbox" class="cb" :checked="selectedIds.has(nota.id)" @change="toggleSelect(nota.id)" />
                    <span class="card-time">{{ formatTime(nota.createdAt) }}</span>
                    <span class="badge" :class="nota.status">{{ nota.status === 'completata' ? '✓ Fatto' : '⏳ In corso' }}</span>
                    <span v-if="nota.sentiment?.emoji" class="sent-emoji" :title="nota.sentiment?.tono">{{ nota.sentiment.emoji }}</span>
                  </div>
                  <button class="btn-delete" @click="deleteNote(nota.id)">✕</button>
                </div>
                <div v-if="nota.filename" class="card-audio">
                  <audio :src="mediaUrl(`/audio/${nota.filename}`)" controls />
                </div>
                <div class="card-text">
                  <template v-if="editingId === nota.id">
                    <textarea
                      v-model="editingText"
                      class="edit-textarea"
                      @keydown.escape="cancelEdit"
                      rows="3"
                      autofocus
                    />
                    <div class="edit-actions">
                      <button class="btn-save" @click="saveEdit(nota)">✓ Salva</button>
                      <button class="btn-cancel" @click="cancelEdit">Annulla</button>
                    </div>
                  </template>
                  <template v-else>
                    <div class="text-row">
                      <span>
                        <span v-if="nota.testo_pulito" class="label-pulito">✨</span>
                        <span :class="{ 'text-clamped': !expandedIds.has(nota.id) }">{{ nota.testo_pulito || nota.testo || '' }}</span>
                        <span v-if="!nota.testo" class="muted">In trascrizione...</span>
                        <button v-if="nota.testo" class="btn-expand" @click.stop="toggleExpand(nota.id)">
                          {{ expandedIds.has(nota.id) ? 'mostra meno ▲' : 'mostra tutto ▼' }}
                        </button>
                      </span>
                      <button v-if="nota.testo" class="btn-edit" @click="startEdit(nota)">✏️</button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- STATS -->
    <main v-else-if="activeTab === 'stats'" class="stats-main">
      <div class="stats-grid">

        <div class="stat-card">
          <div class="stat-num">{{ stats.total }}</div>
          <div class="stat-label">Note totali</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats.weekCount }}</div>
          <div class="stat-label">Questa settimana</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats.completed }}</div>
          <div class="stat-label">Trascritte</div>
        </div>
        <div class="stat-card" v-if="stats.hasSentiment">
          <div class="stat-num">{{ stats.sentimentTop.emoji }}</div>
          <div class="stat-label">Tono prevalente: {{ stats.sentimentTop.tono }}</div>
        </div>

        <div class="stat-card stat-wide">
          <h3 class="stat-title">🕐 Orario di registrazione</h3>
          <div class="bar-chart">
            <div v-for="(count, h) in stats.perHour" :key="h" class="bar-col">
              <div class="bar-fill" :style="{ height: stats.maxHour ? (count / stats.maxHour * 60) + 'px' : '0' }" :title="`${h}:00 — ${count} note`"></div>
              <div class="bar-label">{{ h % 6 === 0 ? h + 'h' : '' }}</div>
            </div>
          </div>
        </div>

        <div class="stat-card stat-wide">
          <h3 class="stat-title">📅 Giorno della settimana</h3>
          <div class="hbar-chart">
            <div v-for="(item, i) in stats.perDay" :key="i" class="hbar-row">
              <div class="hbar-day">{{ item.label }}</div>
              <div class="hbar-track">
                <div class="hbar-fill" :style="{ width: stats.maxDay ? (item.count / stats.maxDay * 100) + '%' : '0' }"></div>
              </div>
              <div class="hbar-count">{{ item.count }}</div>
            </div>
          </div>
        </div>

        <div v-if="stats.hasSentiment" class="stat-card stat-wide">
          <h3 class="stat-title">🎭 Distribuzione sentiment</h3>
          <div class="sentiment-list">
            <div v-for="s in stats.sentimentList" :key="s.tono" class="sentiment-row">
              <span class="sentiment-emoji">{{ s.emoji }}</span>
              <span class="sentiment-tono">{{ s.tono }}</span>
              <div class="hbar-track">
                <div class="hbar-fill sent-fill" :style="{ width: (s.count / stats.total * 100) + '%' }"></div>
              </div>
              <span class="hbar-count">{{ s.count }}</span>
            </div>
          </div>
        </div>

      </div>
    </main>

    <!-- ARCHIVE -->
    <main v-else-if="activeTab === 'archivio'" class="archivio-main">
      <div v-if="archiveLoading" class="empty">Caricamento...</div>
      <div v-else-if="archive.length === 0" class="empty">Nessuna analisi salvata. Lancia "🧠 Analizza" per iniziare.</div>
      <div v-else class="archivio-list">
        <div v-for="entry in archive" :key="entry.id" class="arch-row">
          <div class="arch-title-row">
            <template v-if="editingTitleId === entry.id">
              <input
                class="arch-title-input"
                v-model="editingTitleVal"
                @keydown.enter="saveTitle(entry)"
                @keydown.escape="editingTitleId = null"
                @blur="saveTitle(entry)"
                autofocus
              />
            </template>
            <template v-else>
              <span class="arch-title" @click="startTitleEdit(entry)">{{ entry.titolo || formatDate(entry.generatoIl) }}</span>
              <button class="btn-edit-title" @click="startTitleEdit(entry)">✏️</button>
            </template>
          </div>
          <div class="arch-body">
            <div class="arch-meta">
              <div class="arch-date">{{ formatDate(entry.generatoIl) }}</div>
              <div class="arch-tipi">
                <span v-for="t in (entry.tipi || [])" :key="t" class="arch-chip">{{ typeLabel(t) }}</span>
                <span v-if="entry.power" class="power-badge" :title="`${entry.power.joules} J in ${entry.power.elapsed}s`">⚡ {{ entry.power.watts }} W</span>
              </div>
            </div>
            <div class="arch-preview">
              <span v-if="entry.riassunto?.sintesi" class="arch-sintesi">{{ entry.riassunto.sintesi }}</span>
              <span v-else-if="entry.eventi?.eventi?.length" class="arch-sintesi">{{ entry.eventi.eventi.length }} eventi rilevati</span>
              <span v-else-if="entry.suggerimenti?.suggerimenti?.length" class="arch-sintesi">{{ entry.suggerimenti.suggerimenti.length }} suggerimenti</span>
              <span v-else class="arch-sintesi muted">—</span>
            </div>
            <div class="arch-actions">
              <button class="btn-arch-view" @click="viewArchiveEntry(entry)">Visualizza</button>
              <button class="btn-arch-del" @click="deleteArchiveEntry(entry.id)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- CHAT -->
    <div v-else class="chat-wrap">
      <div class="chat-messages" ref="chatScrollEl">
        <div v-if="chatMessages.length === 0 && !chatLoading" class="chat-empty">
          <div class="chat-empty-icon">💬</div>
          <div>Fai una domanda sulle tue note vocali</div>
          <div class="chat-suggestions">
            <button class="chip" @click="sendChip('Cosa ho detto oggi?')">Cosa ho detto oggi?</button>
            <button class="chip" @click="sendChip('Riassumi le note')">Riassumi le note</button>
            <button class="chip" @click="sendChip('Ci sono appuntamenti o task?')">Appuntamenti o task?</button>
          </div>
        </div>
        <template v-else>
          <div v-for="(msg, i) in chatMessages" :key="i" :class="['bubble-row', msg.role]">
            <div class="bubble-wrap">
              <div class="bubble">{{ msg.content }}</div>
              <span v-if="msg.patched" class="patch-applied-badge">✓ Recap aggiornato</span>
            </div>
          </div>
          <div v-if="chatLoading" class="bubble-row assistant">
            <div class="bubble typing"><span></span><span></span><span></span></div>
          </div>
        </template>
      </div>
      <div v-if="recapMode && analysis" class="recap-sec-bar">
        <button
          v-for="s in recapSections" :key="s.key"
          :class="['recap-sec-btn', { active: recapSection === s.key }]"
          @click="recapSection = s.key"
        >{{ s.label }}</button>
      </div>
      <div class="chat-input-row">
        <button
          class="btn-recap-mode"
          :class="{ active: recapMode }"
          :disabled="!analysis"
          :title="analysis ? 'Correggi il recap corrente' : 'Esegui prima un\'analisi'"
          @click="recapMode = !recapMode"
        >✏️ Recap</button>
        <textarea
          v-model="chatInput"
          class="chat-input"
          :placeholder="recapMode ? 'Chiedi di correggere il recap...' : 'Chiedi qualcosa sulle tue note...'"
          rows="1"
          :disabled="chatLoading"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <button class="chat-send" :disabled="chatLoading || !chatInput.trim()" @click="sendMessage">
          ↑
        </button>
      </div>
    </div>
  </div>

  <!-- Delete confirmation modal -->
  <teleport to="body">
    <div v-if="confirmModal.visible" class="modal-overlay" @click.self="confirmModal.visible = false">
      <div class="modal-box">
        <div class="modal-title">Conferma eliminazione</div>
        <div class="modal-body">{{ confirmModal.message }}</div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" @click="confirmModal.visible = false">Annulla</button>
          <button class="btn-modal-confirm" @click="confirmModal.onConfirm(); confirmModal.visible = false">Elimina</button>
        </div>
      </div>
    </div>
  </teleport>

  <DeviceBadge />
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import DeviceBadge from "../components/DeviceBadge.vue";
import { useApi } from "../composables/useApi.js";

const { apiFetch, mediaUrl } = useApi();

const confirmModal = ref({ visible: false, message: "", onConfirm: () => {} });
function showConfirmModal(message, onConfirm) {
  confirmModal.value = { visible: true, message, onConfirm };
}

const notes = ref([]);
const loading = ref(true);
const search = ref("");
const editingId = ref(null);
const editingText = ref("");
const analysis = ref(null);
const activeTab = ref("note");
const analysisLoading = ref(false);
const analysisError = ref(null);
const analysisLogs = ref([]);
const logPanel = ref(null);
const cleanupLoading = ref(false);
const analysisMenuOpen = ref(false);
const analysisCollapsed = ref(false);
const archive = ref([]);
const archiveLoading = ref(false);
const selectedIds = ref(new Set());
const editingTitleId = ref(null);
const editingTitleVal = ref("");
const editingEventIdx = ref(null);
const editingEvent = ref({});
const editingSummary = ref(false);
const editingSummaryVal = ref({});
const editingSuggestionIdx = ref(null);
const editingSuggestion = ref({});
const editingConnectionIdx = ref(null);
const editingConnection = ref({});
const textInputOpen = ref(false);
const textInput = ref("");
const expandedIds = ref(new Set());

// chat
const chatInput = ref("");
const chatLoading = ref(false);
const chatMessages = ref([]);
const chatHistory = ref([]);
const chatLogs = ref([]);
const chatScrollEl = ref(null);
const analysisStreaming = ref("");
const chatStreaming = ref("");
const recapMode = ref(false);
const recapSection = ref("tutti");
const recapSections = [
  { key: "tutti",         label: "Tutto" },
  { key: "riassunto",    label: "📊 Riassunto" },
  { key: "eventi",       label: "📅 Eventi" },
  { key: "suggerimenti", label: "💡 Suggerimenti" },
  { key: "connessioni",  label: "🔗 Connessioni" },
];

const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => { if (!el.contains(e.target)) binding.value(e); };
    document.addEventListener("click", el._clickOutside);
  },
  unmounted(el) { document.removeEventListener("click", el._clickOutside); },
};

const activeLogs = computed(() => {
  if (chatLoading.value && chatLogs.value.length) return chatLogs.value;
  if (analysisLoading.value && analysisLogs.value.length) return analysisLogs.value;
  return [];
});

const activeStreaming = computed(() => {
  if (chatLoading.value) return chatStreaming.value;
  if (analysisLoading.value || cleanupLoading.value) return analysisStreaming.value;
  return "";
});

const isAnyLoading = computed(() => analysisLoading.value || cleanupLoading.value || chatLoading.value);

const stats = computed(() => {
  const total = notes.value.length;
  const completed = notes.value.filter((n) => n.status === "completata").length;
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const weekCount = notes.value.filter((n) => new Date(n.createdAt).getTime() > cutoff).length;

  const perHour = Array(24).fill(0);
  notes.value.forEach((n) => { perHour[new Date(n.createdAt).getHours()]++; });
  const maxHour = Math.max(...perHour, 1);

  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const dayCounts = Array(7).fill(0);
  notes.value.forEach((n) => { dayCounts[new Date(n.createdAt).getDay()]++; });
  const perDay = days.map((label, i) => ({ label, count: dayCounts[i] }));
  const maxDay = Math.max(...dayCounts, 1);

  const sentMap = {};
  notes.value.forEach((n) => {
    if (n.sentiment?.tono) {
      const key = n.sentiment.tono;
      sentMap[key] = sentMap[key] || { tono: key, emoji: n.sentiment.emoji || "😐", count: 0 };
      sentMap[key].count++;
    }
  });
  const sentimentList = Object.values(sentMap).sort((a, b) => b.count - a.count);
  const hasSentiment = sentimentList.length > 0;
  const sentimentTop = sentimentList[0] || { tono: "—", emoji: "😐" };

  return { total, completed, weekCount, perHour, maxHour, perDay, maxDay, sentimentList, hasSentiment, sentimentTop };
});

watch(activeTab, (tab) => {
  analysisCollapsed.value = tab === "chat";
});

watch(activeLogs, () => {
  nextTick(() => { if (logPanel.value) logPanel.value.scrollTop = logPanel.value.scrollHeight; });
}, { deep: true });

watch(chatMessages, () => {
  nextTick(() => { if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight; });
}, { deep: true });

let pollInterval = null;

const completed = computed(() => filtered.value.filter((n) => n.status === "completata"));
const allSelected = computed(() => completed.value.length > 0 && completed.value.every((n) => selectedIds.value.has(n.id)));
const someSelected = computed(() => completed.value.some((n) => selectedIds.value.has(n.id)) && !allSelected.value);

function toggleExpand(id) {
  const s = new Set(expandedIds.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expandedIds.value = s;
}

function toggleSelect(id) {
  const s = new Set(selectedIds.value);
  s.has(id) ? s.delete(id) : s.add(id);
  selectedIds.value = s;
}

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(completed.value.map((n) => n.id));
  }
}

const filtered = computed(() => {
  const q = search.value.toLowerCase();
  return q ? notes.value.filter((n) =>
    (n.testo_pulito || n.testo || "").toLowerCase().includes(q)
  ) : notes.value;
});

const openDays = ref(new Set());

const groupedByDay = computed(() => {
  const groups = {};
  const order = [];
  filtered.value.forEach((n) => {
    const d = new Date(n.createdAt);
    const key = d.toISOString().slice(0, 10);
    if (!groups[key]) {
      groups[key] = {
        dayKey: key,
        dayLabel: d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
        notes: [],
      };
      order.push(key);
    }
    groups[key].notes.push(n);
  });
  return order.map((k) => groups[k]);
});

watch(groupedByDay, (groups) => {
  if (groups.length > 0 && openDays.value.size === 0) {
    openDays.value = new Set([groups[0].dayKey]);
  }
}, { immediate: true });

function toggleDay(key) {
  const s = new Set(openDays.value);
  s.has(key) ? s.delete(key) : s.add(key);
  openDays.value = s;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

async function loadNotes(showLoading = true) {
  if (showLoading) loading.value = true;
  try {
    const res = await apiFetch("/api/notes");
    notes.value = await res.json();
  } finally {
    if (showLoading) loading.value = false;
  }
  const hasPending = notes.value.some((n) => n.status === "in_elaborazione");
  if (!hasPending && pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  else if (hasPending && !pollInterval) { pollInterval = setInterval(() => loadNotes(false), 4000); }
}

async function pollJob(jobId, onDone, onError, onLogs, onStream) {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/job/${jobId}`);
        const job = await res.json();
        if (onLogs && job.logs) onLogs(job.logs);
        if (onStream && job.streaming !== undefined) onStream(job.streaming);
        if (job.status === "completed") {
          clearInterval(interval);
          onDone(job.result);
          resolve();
        } else if (job.status === "failed") {
          clearInterval(interval);
          onError(job.error);
          resolve();
        }
      } catch {
        clearInterval(interval);
        onError("Errore di rete");
        resolve();
      }
    }, 1500);
  });
}

async function startCleanup() {
  cleanupLoading.value = true;
  analysisError.value = null;
  analysisStreaming.value = "";
  try {
    const res = await apiFetch("/api/pulisci", { method: "POST" });
    const { jobId } = await res.json();
    await pollJob(
      jobId,
      async () => { analysisStreaming.value = ""; await loadNotes(); },
      (err) => { analysisError.value = err; },
      (logs) => { analysisLogs.value = logs; },
      (text) => { analysisStreaming.value = text; }
    );
  } catch (err) {
    analysisError.value = err.message;
  } finally {
    cleanupLoading.value = false;
    analysisStreaming.value = "";
  }
}

async function startAnalysis(type = "tutto") {
  analysisMenuOpen.value = false;
  analysisLoading.value = true;
  analysisError.value = null;
  analysis.value = null;
  analysisLogs.value = [];
  analysisStreaming.value = "";
  try {
    const noteIds = selectedIds.value.size > 0 ? [...selectedIds.value] : null;
    const res = await apiFetch("/api/analisi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: type, noteIds }),
    });
    const { jobId } = await res.json();
    await pollJob(
      jobId,
      (result) => { analysisStreaming.value = ""; analysis.value = result; },
      (err) => { analysisError.value = err; },
      (logs) => { analysisLogs.value = logs; },
      (text) => { analysisStreaming.value = text; }
    );
  } catch (err) {
    analysisError.value = err.message;
  } finally {
    analysisLoading.value = false;
    analysisStreaming.value = "";
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function startEdit(nota) {
  editingId.value = nota.id;
  editingText.value = nota.testo_pulito || nota.testo || "";
}

function cancelEdit() {
  editingId.value = null;
  editingText.value = "";
}

async function saveEdit(nota) {
  const field = nota.testo_pulito !== undefined ? "testo_pulito" : "testo";
  await apiFetch(`/api/notes/${nota.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: editingText.value }),
  });
  const idx = notes.value.findIndex((n) => n.id === nota.id);
  if (idx !== -1) notes.value[idx] = { ...notes.value[idx], [field]: editingText.value };
  cancelEdit();
}

function deleteNote(id) {
  showConfirmModal("Vuoi eliminare questa nota? L'operazione non può essere annullata.", async () => {
    await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
    notes.value = notes.value.filter((n) => n.id !== id);
  });
}

function applyPatch(patch) {
  if (!patch || !analysis.value) return;
  if (patch.sezione === "eventi")       analysis.value.eventi       = patch.data;
  if (patch.sezione === "riassunto")    analysis.value.riassunto    = patch.data;
  if (patch.sezione === "suggerimenti") analysis.value.suggerimenti = patch.data;
  if (patch.sezione === "connessioni")  analysis.value.connessioni  = patch.data;
  const archiveId = analysis.value.archiveId || analysis.value.id;
  if (archiveId) {
    apiFetch(`/api/archivio/${archiveId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [patch.sezione]: patch.data }),
    });
  }
  activeTab.value = "note";
}

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || chatLoading.value) return;
  chatInput.value = "";
  chatMessages.value.push({ role: "user", content: question });
  chatLoading.value = true;
  chatLogs.value = [];
  try {
    const useRecap = recapMode.value && analysis.value;
    const endpoint = useRecap ? "/api/chat-recap" : "/api/chat";
    const analysisContext = useRecap
      ? (recapSection.value === "tutti" ? analysis.value : { [recapSection.value]: analysis.value[recapSection.value] })
      : null;
    const body = useRecap
      ? { question, history: chatHistory.value, analysis: analysisContext }
      : { question, history: chatHistory.value };
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { jobId } = await res.json();
    await pollJob(
      jobId,
      (result) => {
        chatStreaming.value = "";
        const reply = result.reply || "Nessuna risposta.";
        const patch = result.patch || null;
        if (patch) applyPatch(patch);
        chatMessages.value.push({ role: "assistant", content: reply, patched: !!patch });
        chatHistory.value.push({ user: question, assistant: reply });
      },
      (err) => { chatMessages.value.push({ role: "assistant", content: `⚠️ Errore: ${err}` }); },
      (logs) => { chatLogs.value = logs; },
      (text) => { chatStreaming.value = text; }
    );
  } catch (err) {
    chatMessages.value.push({ role: "assistant", content: `⚠️ Errore: ${err.message}` });
  } finally {
    chatLoading.value = false;
    chatLogs.value = [];
  }
}

const TYPE_LABEL = { eventi: "📅 Eventi", riassunto: "📊 Riassunto", suggerimenti: "💡 Suggerimenti", connessioni: "🔗 Connessioni" };
function typeLabel(t) { return TYPE_LABEL[t] || t; }

async function loadArchive() {
  archiveLoading.value = true;
  try {
    const res = await apiFetch("/api/archivio");
    archive.value = await res.json();
  } finally {
    archiveLoading.value = false;
  }
}

function startTitleEdit(entry) {
  editingTitleId.value = entry.id;
  editingTitleVal.value = entry.titolo || "";
}

async function saveTitle(entry) {
  if (!editingTitleId.value) return;
  const titolo = editingTitleVal.value.trim() || entry.titolo;
  await apiFetch(`/api/archivio/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titolo }),
  });
  const idx = archive.value.findIndex((e) => e.id === entry.id);
  if (idx !== -1) archive.value[idx] = { ...archive.value[idx], titolo };
  editingTitleId.value = null;
}

function viewArchiveEntry(entry) {
  analysis.value = entry;
  activeTab.value = "note";
}

function deleteArchiveEntry(id) {
  showConfirmModal("Vuoi eliminare questo recap dall'archivio? L'operazione non può essere annullata.", async () => {
    await apiFetch(`/api/archivio/${id}`, { method: "DELETE" });
    archive.value = archive.value.filter((e) => e.id !== id);
  });
}

function sendChip(text) {
  chatInput.value = text;
  sendMessage();
}

function getArchiveId() {
  return analysis.value?.id || analysis.value?.archiveId || null;
}

async function patchAnalysisArchive(fields) {
  const id = getArchiveId();
  if (!id) return;
  await apiFetch(`/api/archivio/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const idx = archive.value.findIndex((e) => e.id === id);
  if (idx !== -1) archive.value[idx] = { ...archive.value[idx], ...fields };
}

function startEventEdit(ev, idx) {
  editingEventIdx.value = idx;
  editingEvent.value = { ...ev };
}

async function saveEventEdit() {
  if (editingEventIdx.value === null) return;
  analysis.value.eventi.eventi[editingEventIdx.value] = { ...editingEvent.value };
  editingEventIdx.value = null;
  await patchAnalysisArchive({ eventi: analysis.value.eventi });
}

function cancelEventEdit() {
  editingEventIdx.value = null;
}

function startSummaryEdit() {
  editingSummaryVal.value = {
    ...analysis.value.riassunto,
    argomenti: (analysis.value.riassunto?.argomenti || []).join("\n"),
  };
  editingSummary.value = true;
}

async function saveSummary() {
  analysis.value.riassunto = {
    ...editingSummaryVal.value,
    argomenti: editingSummaryVal.value.argomenti.split("\n").map((s) => s.trim()).filter(Boolean),
  };
  editingSummary.value = false;
  await patchAnalysisArchive({ riassunto: analysis.value.riassunto });
}

function startSuggestionEdit(s, idx) {
  editingSuggestionIdx.value = idx;
  editingSuggestion.value = { ...s };
}

async function saveSuggestion() {
  if (editingSuggestionIdx.value === null) return;
  analysis.value.suggerimenti.suggerimenti[editingSuggestionIdx.value] = { ...editingSuggestion.value };
  editingSuggestionIdx.value = null;
  await patchAnalysisArchive({ suggerimenti: analysis.value.suggerimenti });
}

function startConnectionEdit(c, idx) {
  editingConnectionIdx.value = idx;
  editingConnection.value = { ...c, note: (c.note || []).join("\n") };
}

async function saveConnection() {
  if (editingConnectionIdx.value === null) return;
  analysis.value.connessioni.connessioni[editingConnectionIdx.value] = {
    ...editingConnection.value,
    note: editingConnection.value.note.split("\n").map((s) => s.trim()).filter(Boolean),
  };
  editingConnectionIdx.value = null;
  await patchAnalysisArchive({ connessioni: analysis.value.connessioni });
}

function parseEventDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2020) return d;
  const months = { gennaio:0, febbraio:1, marzo:2, aprile:3, maggio:4, giugno:5, luglio:6, agosto:7, settembre:8, ottobre:9, novembre:10, dicembre:11 };
  const m1 = str.match(/(\d{1,2})\s+([a-zà-ü]+)\s+(\d{4})(?:[^\d]+(\d{1,2})[:\s](\d{2}))?/i);
  if (m1 && months[m1[2].toLowerCase()] !== undefined)
    return new Date(+m1[3], months[m1[2].toLowerCase()], +m1[1], m1[4] ? +m1[4] : 0, m1[5] ? +m1[5] : 0);
  const m2 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
  return null;
}

function buildCalendarUrl(ev) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d, t) => {
    const base = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    return t ? `${base}T${pad(d.getHours())}${pad(d.getMinutes())}00` : base;
  };
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.titolo });
  if (ev.contesto) p.set("details", ev.contesto);
  const d = parseEventDate(ev.data);
  if (d) {
    const hasTime = /\d{1,2}[:h]\d{2}/.test(ev.data || "");
    const start = fmt(d, hasTime);
    const end = hasTime
      ? fmt(new Date(d.getTime() + 3600000), true)
      : fmt(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), false);
    p.set("dates", `${start}/${end}`);
  }
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

async function addTextNote() {
  if (!textInput.value.trim()) return;
  await apiFetch("/api/notes/testo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testo: textInput.value.trim() }),
  });
  textInput.value = "";
  textInputOpen.value = false;
  await loadNotes();
}

onMounted(() => { loadNotes(); });
onUnmounted(() => clearInterval(pollInterval));
</script>

<style scoped>
.bo { display: flex; flex-direction: column; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f7; color: #1d1d1f; }

.bo-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: #fff; border-bottom: 1px solid #e5e5ea; gap: 12px; }
.bo-header h1 { font-size: 18px; font-weight: 700; white-space: nowrap; }
.header-right { display: flex; gap: 10px; align-items: center; flex: 1; justify-content: flex-end; }

.search { padding: 8px 14px; border: 1px solid #e5e5ea; border-radius: 10px; font-size: 14px; width: 240px; outline: none; }
.search:focus { border-color: #007aff; }

.btn-pulisci { padding: 8px 16px; background: #34c759; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-pulisci:disabled { opacity: 0.6; cursor: not-allowed; }

.analisi-split { position: relative; display: flex; }
.btn-analisi { padding: 8px 14px; background: #5856d6; color: #fff; border: none; border-radius: 10px 0 0 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-analisi:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-analisi-arrow { padding: 8px 10px; background: #4a48c0; color: #fff; border: none; border-left: 1px solid #6e6cd4; border-radius: 0 10px 10px 0; font-size: 12px; cursor: pointer; }
.btn-analisi-arrow:disabled { opacity: 0.6; cursor: not-allowed; }
.analisi-dropdown { position: absolute; top: calc(100% + 6px); right: 0; background: #fff; border: 1px solid #e5e5ea; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); min-width: 200px; z-index: 100; overflow: hidden; }
.analisi-dropdown button { display: block; width: 100%; padding: 11px 16px; text-align: left; background: none; border: none; font-size: 14px; color: #1d1d1f; cursor: pointer; }
.analisi-dropdown button:hover { background: #f5f5f7; }
.analisi-dropdown button + button { border-top: 1px solid #f2f2f7; }

.btn-testo { padding: 8px 12px; border: 1px solid #e5e5ea; border-radius: 10px; background: #fff; font-size: 16px; cursor: pointer; transition: background 0.15s; }
.btn-testo:hover { background: #f5f5f7; }
.btn-testo.active { background: #fff4e5; border-color: #ff9500; }
.testo-panel { background: #fff; border-bottom: 1px solid #e5e5ea; padding: 16px 24px; display: flex; flex-direction: column; gap: 10px; }
.testo-area { width: 100%; padding: 10px 14px; border: 1.5px solid #e5e5ea; border-radius: 12px; font-size: 14px; font-family: inherit; resize: vertical; outline: none; line-height: 1.5; box-sizing: border-box; }
.testo-area:focus { border-color: #007aff; }
.testo-actions { display: flex; align-items: center; gap: 8px; }
.testo-hint { font-size: 12px; color: #c7c7cc; margin-left: 4px; }
.btn-refresh { padding: 8px 12px; border: 1px solid #e5e5ea; border-radius: 10px; background: #fff; font-size: 16px; cursor: pointer; }

.sel-badge { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #e8f0ff; color: #5856d6; border-radius: 10px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.sel-clear { background: none; border: none; cursor: pointer; color: #5856d6; font-size: 14px; padding: 0; line-height: 1; }
.cb { width: 16px; height: 16px; cursor: pointer; accent-color: #5856d6; }
.cell-cb { width: 36px; text-align: center; padding: 14px 8px; }
tbody tr.selected { background: #f0efff; }
tbody tr.selected:hover { background: #e8e7ff; }

.tab-bar { display: flex; gap: 4px; padding: 8px 24px 0; background: #fff; border-bottom: 1px solid #e5e5ea; }
.tab-btn { padding: 8px 18px; border: none; background: none; font-size: 14px; font-weight: 500; color: #8e8e93; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab-btn.active { color: #007aff; border-bottom-color: #007aff; font-weight: 600; }
.tab-btn:hover:not(.active) { color: #3c3c43; }

.analisi-panel { background: #fff; border-bottom: 1px solid #e5e5ea; padding: 20px 24px; }
.analisi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 13px; color: #8e8e93; font-weight: 500; }
.analisi-header-left { display: flex; align-items: center; gap: 10px; }
.analisi-header-actions { display: flex; align-items: center; gap: 8px; }
.power-badge { display: inline-flex; align-items: center; gap: 3px; background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 20px; padding: 2px 10px; font-size: 12px; font-weight: 600; cursor: default; }
.btn-collapse-panel { background: none; border: 1px solid #e5e5ea; border-radius: 8px; font-size: 12px; color: #8e8e93; cursor: pointer; padding: 3px 10px; }
.btn-collapse-panel:hover { border-color: #c7c7cc; color: #3c3c43; }
.analisi-panel:has(.analisi-cards[style*="none"]) { padding-bottom: 0; }
.close-btn { background: none; border: none; font-size: 18px; color: #c7c7cc; cursor: pointer; }

.analisi-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

.acard { background: #f5f5f7; border-radius: 14px; padding: 16px; }
.acard-full { grid-column: 1 / -1; }
.acard h3 { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #1d1d1f; }
.acard-empty { color: #c7c7cc; font-size: 13px; font-style: italic; }

.eventi-list { display: flex; flex-direction: column; gap: 10px; }
.evento { background: #fff; border-radius: 10px; padding: 10px 12px; }
.evento-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px; }
.evento-titolo { font-size: 13px; font-weight: 600; flex: 1; }
.evento-header-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.btn-gcal { font-size: 16px; text-decoration: none; opacity: 0.6; transition: opacity 0.15s; line-height: 1; }
.btn-gcal:hover { opacity: 1; }
.btn-ev-edit { background: none; border: none; font-size: 13px; cursor: pointer; opacity: 0; padding: 0 2px; transition: opacity 0.15s; }
.evento:hover .btn-ev-edit,
.suggerimento:hover .btn-ev-edit,
.connessione:hover .btn-ev-edit { opacity: 1; }
.ev-input { width: 100%; padding: 6px 10px; border: 1.5px solid #e5e5ea; border-radius: 8px; font-size: 13px; font-family: inherit; outline: none; margin-bottom: 6px; box-sizing: border-box; }
.ev-input:focus { border-color: #007aff; }
.ev-select { padding: 6px 10px; border: 1.5px solid #e5e5ea; border-radius: 8px; font-size: 13px; outline: none; margin-bottom: 6px; width: 100%; }
.ev-edit-actions { display: flex; gap: 8px; }
.acard-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.acard-title-row h3 { margin-bottom: 0; }
.btn-acard-edit { background: none; border: none; font-size: 13px; cursor: pointer; opacity: 0.5; padding: 0; transition: opacity 0.15s; }
.btn-acard-edit:hover { opacity: 1; }
.rv-field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.rv-field label { font-size: 11px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.4px; }
.rv-textarea { resize: vertical; }
.evento-meta { font-size: 12px; color: #8e8e93; margin-top: 2px; }

.riassunto { display: flex; flex-direction: column; gap: 8px; }
.riassunto-row { font-size: 13px; line-height: 1.5; }
.riassunto-row strong { color: #8e8e93; font-weight: 600; margin-right: 4px; }
.sintesi { color: #3c3c43; font-style: italic; border-top: 1px solid #e5e5ea; padding-top: 8px; margin-top: 4px; }

.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.tag { background: #e5e5ea; border-radius: 20px; padding: 2px 10px; font-size: 12px; }

.suggerimenti-list { display: flex; flex-direction: column; gap: 10px; }
.suggerimento { background: #fff; border-radius: 10px; padding: 10px 12px; }
.sug-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.sug-titolo { font-size: 13px; font-weight: 600; }
.sug-desc { font-size: 12px; color: #3c3c43; line-height: 1.4; }

.connessioni-list { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; }
.connessione { background: #fff; border-radius: 10px; padding: 10px 14px; flex: 1; min-width: 200px; border-left: 3px solid #5856d6; }
.conn-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.conn-tema { font-size: 13px; font-weight: 700; color: #5856d6; }
.connessione:hover .btn-ev-edit { opacity: 1; }
.conn-desc { font-size: 12px; color: #3c3c43; line-height: 1.4; margin-bottom: 4px; }
.conn-note { font-size: 11px; color: #8e8e93; }

.badge-prio { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; }
.badge-prio.alta { background: #ffe5e5; color: #ff3b30; }
.badge-prio.media { background: #fff4e5; color: #ff9500; }
.badge-prio.bassa { background: #e8f8ec; color: #34c759; }

.log-panel { background: #1c1c1e; color: #30d158; font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; padding: 12px 24px; max-height: 110px; overflow-y: auto; border-bottom: 1px solid #38383a; }
.log-line { padding: 1px 0; line-height: 1.6; white-space: pre-wrap; display: flex; gap: 10px; align-items: baseline; }
.log-meta { color: #636366; font-size: 11px; flex-shrink: 0; }
.log-msg { color: #30d158; }
.log-waiting { display: flex; align-items: center; gap: 6px; }
.log-waiting-text { color: #636366; font-size: 11px; }
.dot { width: 5px; height: 5px; background: #30d158; border-radius: 50%; animation: pulse 1.2s infinite; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes pulse { 0%,60%,100% { opacity: 0.2; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1); } }
.log-streaming { border-top: 1px solid #2c2c2e; margin-top: 6px; padding-top: 6px; display: flex; gap: 8px; align-items: flex-start; max-height: 72px; overflow-y: auto; }
.log-streaming-label { color: #636366; font-size: 11px; flex-shrink: 0; margin-top: 1px; }
.log-streaming-text { color: #ffd60a; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.log-cursor { display: inline-block; animation: blink 1s step-end infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

.error-bar { background: #ffe5e5; color: #ff3b30; padding: 10px 24px; font-size: 14px; font-weight: 500; }

.slide-enter-active, .slide-leave-active { transition: all 0.3s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-10px); }

.bo-main { flex: 1; overflow: auto; padding: 20px 24px; }
.empty { text-align: center; color: #8e8e93; padding: 60px; }
.table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
thead th { background: #f2f2f7; padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px; }
tbody tr { border-top: 1px solid #f2f2f7; transition: background 0.15s; }
tbody tr:hover { background: #fafafa; }
tbody tr.pending { opacity: 0.7; }
td { padding: 14px 16px; vertical-align: middle; font-size: 14px; }
.cell-date { color: #8e8e93; font-size: 13px; white-space: nowrap; }
.cell-audio audio { width: 160px; height: 32px; }
.cell-status { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.badge.completata { background: #e8f8ec; color: #34c759; }
.badge.in_elaborazione { background: #fff4e5; color: #ff9500; }
.sent-emoji { font-size: 16px; line-height: 1; }
.cell-text { max-width: 500px; line-height: 1.5; }
.muted { color: #c7c7cc; font-style: italic; }
.label-pulito { display: inline-block; font-size: 10px; font-weight: 700; background: #e8f8ec; color: #34c759; border-radius: 6px; padding: 1px 6px; margin-right: 6px; vertical-align: middle; }
.btn-delete { background: none; border: none; color: #c7c7cc; font-size: 16px; cursor: pointer; padding: 4px 8px; }
.btn-delete:hover { color: #ff3b30; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-box { background: #fff; border-radius: 16px; padding: 28px 24px 20px; max-width: 360px; width: 90%; box-shadow: 0 12px 40px rgba(0,0,0,0.18); }
.modal-title { font-size: 16px; font-weight: 700; color: #1d1d1f; margin-bottom: 10px; }
.modal-body { font-size: 14px; color: #3a3a3c; margin-bottom: 24px; line-height: 1.5; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn-modal-cancel { padding: 8px 18px; background: #f2f2f7; color: #1d1d1f; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-modal-confirm { padding: 8px 18px; background: #ff3b30; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-modal-confirm:hover { background: #d93025; }

.stats-main { flex: 1; overflow: auto; padding: 24px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.stat-wide { grid-column: span 2; }
.stat-num { font-size: 36px; font-weight: 700; color: #1d1d1f; line-height: 1; margin-bottom: 6px; }
.stat-label { font-size: 13px; color: #8e8e93; }
.stat-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; color: #1d1d1f; }

.bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 70px; }
.bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; gap: 3px; }
.bar-fill { background: #5856d6; border-radius: 3px 3px 0 0; width: 100%; min-height: 2px; transition: height 0.3s; }
.bar-label { font-size: 9px; color: #8e8e93; }

.hbar-chart { display: flex; flex-direction: column; gap: 8px; }
.hbar-row { display: flex; align-items: center; gap: 10px; }
.hbar-day { font-size: 12px; color: #8e8e93; width: 28px; flex-shrink: 0; }
.hbar-track { flex: 1; background: #f2f2f7; border-radius: 4px; height: 10px; overflow: hidden; }
.hbar-fill { background: #007aff; height: 100%; border-radius: 4px; transition: width 0.3s; }
.sent-fill { background: #5856d6; }
.hbar-count { font-size: 12px; color: #8e8e93; width: 20px; text-align: right; }

.sentiment-list { display: flex; flex-direction: column; gap: 10px; }
.sentiment-row { display: flex; align-items: center; gap: 10px; }
.sentiment-emoji { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.sentiment-tono { font-size: 13px; color: #3c3c43; width: 90px; flex-shrink: 0; text-transform: capitalize; }

.archivio-main { flex: 1; overflow: auto; padding: 20px 24px; }
.archivio-list { display: flex; flex-direction: column; gap: 10px; }
.arch-row { background: #fff; border-radius: 14px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.arch-title-row { display: flex; align-items: center; gap: 6px; }
.arch-title { font-size: 15px; font-weight: 700; color: #1d1d1f; cursor: pointer; flex: 1; }
.arch-title:hover { color: #5856d6; }
.arch-body { display: flex; align-items: center; gap: 16px; }
.arch-meta { flex-shrink: 0; }
.arch-title-input { font-size: 14px; font-weight: 700; border: 1.5px solid #5856d6; border-radius: 6px; padding: 2px 8px; outline: none; width: 100%; }
.btn-edit-title { background: none; border: none; font-size: 12px; cursor: pointer; opacity: 0; padding: 0; }
.arch-row:hover .btn-edit-title { opacity: 1; }
.arch-date { font-size: 12px; color: #8e8e93; margin-bottom: 4px; }
.arch-tipi { display: flex; flex-wrap: wrap; gap: 4px; }
.arch-chip { background: #f0efff; color: #5856d6; border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
.arch-preview { flex: 1; }
.arch-sintesi { font-size: 13px; color: #3c3c43; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.arch-sintesi.muted { color: #c7c7cc; font-style: italic; }
.arch-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.btn-arch-view { padding: 7px 14px; background: #5856d6; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-arch-view:hover { background: #4a48c0; }
.btn-arch-del { background: none; border: none; color: #c7c7cc; font-size: 16px; cursor: pointer; padding: 4px 8px; }
.btn-arch-del:hover { color: #ff3b30; }

.chat-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.chat-messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; color: #8e8e93; font-size: 15px; gap: 12px; margin: auto; }
.chat-empty-icon { font-size: 48px; }
.chat-suggestions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 4px; }
.chip { padding: 8px 16px; background: #fff; border: 1px solid #e5e5ea; border-radius: 20px; font-size: 13px; color: #3c3c43; cursor: pointer; }
.chip:hover { background: #f5f5f7; border-color: #007aff; color: #007aff; }
.bubble-row { display: flex; }
.bubble-row.user { justify-content: flex-end; }
.bubble-row.assistant { justify-content: flex-start; }
.bubble-wrap { display: flex; flex-direction: column; gap: 6px; max-width: 70%; }
.bubble-row.user .bubble-wrap { align-items: flex-end; }
.bubble { padding: 12px 16px; border-radius: 18px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.bubble-row.user .bubble { background: #007aff; color: #fff; border-bottom-right-radius: 4px; }
.bubble-row.assistant .bubble { background: #fff; color: #1d1d1f; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.patch-applied-badge { align-self: flex-start; padding: 4px 10px; background: #e8faea; color: #1a7f37; border-radius: 20px; font-size: 12px; font-weight: 600; }
.btn-recap-mode { padding: 8px 12px; border: 1.5px solid #e5e5ea; border-radius: 10px; background: #fff; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.15s; }
.btn-recap-mode:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-recap-mode.active { background: #fff4e5; border-color: #ff9500; color: #ff9500; }
.recap-sec-bar { display: flex; gap: 6px; padding: 8px 24px 0; flex-wrap: wrap; }
.recap-sec-btn { padding: 5px 12px; border: 1.5px solid #e5e5ea; border-radius: 20px; background: #fff; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.recap-sec-btn.active { background: #ff9500; border-color: #ff9500; color: #fff; }
.recap-sec-btn:not(.active):hover { border-color: #ff9500; color: #ff9500; }
.typing { display: flex; align-items: center; gap: 5px; padding: 14px 18px; }
.typing span { width: 7px; height: 7px; background: #c7c7cc; border-radius: 50%; animation: bounce 1.2s infinite; }
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
.chat-input-row { display: flex; gap: 10px; padding: 16px 24px; background: #fff; border-top: 1px solid #e5e5ea; align-items: flex-end; }
.chat-input { flex: 1; padding: 10px 14px; border: 1.5px solid #e5e5ea; border-radius: 14px; font-size: 14px; font-family: inherit; resize: none; outline: none; line-height: 1.5; max-height: 120px; }
.chat-input:focus { border-color: #007aff; }
.chat-input:disabled { opacity: 0.5; }
.chat-send { width: 40px; height: 40px; background: #007aff; color: #fff; border: none; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chat-send:disabled { background: #c7c7cc; cursor: not-allowed; }

.text-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.text-row span { flex: 1; }
.btn-edit { background: none; border: none; font-size: 14px; cursor: pointer; opacity: 0; padding: 2px 6px; flex-shrink: 0; }
tr:hover .btn-edit { opacity: 1; }
.edit-textarea { width: 100%; min-height: 80px; padding: 8px 10px; border: 1.5px solid #007aff; border-radius: 8px; font-size: 14px; font-family: inherit; line-height: 1.5; resize: vertical; outline: none; box-sizing: border-box; }
.edit-actions { display: flex; gap: 8px; margin-top: 8px; }
.btn-save { padding: 6px 14px; background: #007aff; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-save:hover { background: #0066d6; }
.btn-cancel { padding: 6px 14px; background: #f2f2f7; color: #3c3c43; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-cancel:hover { background: #e5e5ea; }

.text-clamped { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.btn-expand { display: block; background: none; border: none; color: #007aff; font-size: 12px; cursor: pointer; padding: 2px 0; margin-top: 2px; }
.btn-expand:hover { text-decoration: underline; }

.note-toolbar { display: flex; align-items: center; padding: 0 0 10px; }
.select-all-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #8e8e93; cursor: pointer; user-select: none; }

.giorni-list { display: flex; flex-direction: column; gap: 10px; }
.giorno-accordion { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.giorno-header { width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: #fff; border: none; border-bottom: 1px solid transparent; cursor: pointer; text-align: left; transition: background 0.15s; }
.giorno-header:hover { background: #f5f5f7; }
.giorno-header.open { border-bottom-color: #f2f2f7; }
.giorno-chevron { font-size: 20px; color: #8e8e93; font-weight: 300; transition: transform 0.2s; display: inline-block; line-height: 1; }
.giorno-chevron.open { transform: rotate(90deg); }
.giorno-label { font-size: 14px; font-weight: 700; color: #1d1d1f; flex: 1; text-transform: capitalize; }
.giorno-count { font-size: 12px; color: #8e8e93; background: #f2f2f7; padding: 3px 10px; border-radius: 20px; flex-shrink: 0; }
.giorno-body { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }

.nota-card { border: 1.5px solid #f2f2f7; border-radius: 12px; overflow: hidden; background: #fff; transition: border-color 0.15s; }
.nota-card:hover { border-color: #e5e5ea; }
.nota-card.selected { border-color: #5856d6; background: #f8f7ff; }
.nota-card.pending { opacity: 0.7; }
.card-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #fafafa; border-bottom: 1px solid #f2f2f7; gap: 8px; }
.card-head-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.card-time { font-size: 13px; color: #8e8e93; font-weight: 600; white-space: nowrap; }
.card-audio { padding: 10px 14px 6px; }
.card-audio audio { width: 100%; height: 36px; }
.card-text { padding: 10px 14px; font-size: 14px; line-height: 1.5; }

@media (max-width: 768px) {
  .bo-header { flex-wrap: wrap; padding: 10px 14px; gap: 8px; }
  .bo-header h1 { font-size: 15px; }
  .header-right { flex-wrap: wrap; gap: 8px; }
  .search { order: 10; width: 100%; }
  .btn-pulisci { font-size: 13px; padding: 8px 12px; }
  .btn-analisi { font-size: 13px; padding: 8px 10px; }
  .tab-bar { padding: 6px 14px 0; gap: 2px; }
  .tab-btn { padding: 8px 10px; font-size: 13px; }
  .analisi-panel { padding: 14px; }
  .analisi-cards { grid-template-columns: 1fr; }
  .acard-full { grid-column: 1; }
  .bo-main { padding: 12px 14px; }
  .stats-main { padding: 14px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .stat-wide { grid-column: span 2; }
  .archivio-main { padding: 12px 14px; }
  .arch-row { flex-direction: column; gap: 10px; }
  .arch-meta { width: 100%; }
  .arch-actions { width: 100%; justify-content: flex-end; }
  .chat-messages { padding: 14px; }
  .chat-input-row { padding: 10px 14px; }
  .bubble { max-width: 90%; }
  .log-panel { padding: 10px 14px; }
  .giorno-header { padding: 12px 14px; }
  .giorno-body { padding: 0 8px 8px; }
  .giorno-label { font-size: 13px; }
}

@media (max-width: 480px) {
  .bo-header h1 { display: none; }
  .tab-btn { padding: 8px 8px; font-size: 12px; }
  .sel-badge { font-size: 12px; padding: 6px 8px; }
}

/* DEVICE MODAL */
.device-modal-box { max-width: 480px; padding: 0; overflow: hidden; }
.device-modal-header { display: flex; align-items: center; gap: 14px; padding: 20px 24px; color: #fff; position: relative; }
.device-modal-title { font-size: 18px; font-weight: 700; line-height: 1.2; }
.device-modal-sub { font-size: 12px; opacity: 0.8; margin-top: 2px; }
.device-modal-close { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.2); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.device-modal-close:hover { background: rgba(255,255,255,0.35); }
.device-dot-lg { width: 12px; height: 12px; flex-shrink: 0; }
.device-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
.device-modal-empty { padding: 24px; color: #8e8e93; font-size: 14px; text-align: center; }
.device-spec-section-title { font-size: 11px; font-weight: 700; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }
.device-spec-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; }
.spec-key { font-size: 13px; color: #8e8e93; white-space: nowrap; }
.spec-val { font-size: 13px; color: #1d1d1f; font-weight: 600; }

</style>
