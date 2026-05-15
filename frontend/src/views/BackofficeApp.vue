<template>
  <div class="bo">
    <header class="bo-header">
      <h1 class="header-brand">
        <img src="/kubi_logo.png" alt="KuBi" class="header-logo" />
      </h1>
      <DeviceBadge inline />
      <div class="header-right">
        <input v-model="search" class="search" placeholder="Cerca nelle trascrizioni..." />
        <button class="btn-io" @click="exportNotes" title="Esporta note">
          <Icon icon="lucide:download" :width="16" :height="16" style="vertical-align: middle" /> <span class="btn-text">{{ selectedIds.size > 0 ? `Export (${selectedIds.size})` : 'Export' }}</span>
        </button>
        <button class="btn-io" @click="$refs.importInput.click()" title="Importa note"><Icon icon="lucide:upload" :width="16" :height="16" style="vertical-align: middle" /> <span class="btn-text">Import</span></button>
        <input ref="importInput" type="file" accept=".json" style="display:none" @change="importNotes" />
        <button class="btn-io btn-audio-import" :disabled="audioUploading" @click="$refs.audioInput.click()" title="Importa file audio">
          <Icon :icon="audioUploading ? 'lucide:loader' : 'lucide:mic'" :width="16" :height="16" style="vertical-align: middle" /> <span class="btn-text">{{ audioUploading ? audioUploadProgress : 'Import Audio' }}</span>
        </button>
        <input ref="audioInput" type="file" accept="audio/*,video/mp4,video/webm,video/quicktime" multiple style="display:none" @change="importAudio" />
        <button class="btn-pulisci" :disabled="cleanupLoading || analysisLoading" @click="startCleanup">
          <Icon :icon="cleanupLoading ? 'lucide:loader' : 'lucide:sparkles'" :width="16" :height="16" style="vertical-align: middle" /> {{ cleanupLoading ? "Pulizia in corso..." : "Sistema note" }}
        </button>

        <div v-if="selectedIds.size > 0" class="sel-badge">
          {{ selectedIds.size }} selezionat{{ selectedIds.size === 1 ? 'a' : 'e' }}
          <button class="sel-clear" @click="clearSelection"><Icon icon="lucide:x" :width="14" :height="14" style="vertical-align: middle" /></button>
        </div>

        <div class="analisi-split" v-click-outside="() => analysisMenuOpen = false">
          <button class="btn-analisi" :disabled="analysisLoading || cleanupLoading" @click="startAnalysis('tutto')">
            <Icon :icon="analysisLoading ? 'lucide:loader' : 'lucide:brain'" :width="16" :height="16" style="vertical-align: middle" />
            <span>{{ analysisLoading ? "Analisi..." : selectedIds.size > 0 ? `Analizza (${selectedIds.size})` : "Analizza" }}</span>
          </button>
          <button class="btn-analisi-arrow" :disabled="analysisLoading || cleanupLoading" @click.stop="analysisMenuOpen = !analysisMenuOpen">▾</button>
          <div v-if="analysisMenuOpen" class="analisi-dropdown">
            <button @click="startAnalysis('eventi')"><Icon icon="lucide:calendar" :width="16" :height="16" style="vertical-align: middle" /> Solo eventi e task</button>
            <button @click="startAnalysis('riassunto')"><Icon icon="lucide:bar-chart-2" :width="16" :height="16" style="vertical-align: middle" /> Solo riassunto</button>
            <button @click="startAnalysis('suggerimenti')"><Icon icon="lucide:lightbulb" :width="16" :height="16" style="vertical-align: middle" /> Solo suggerimenti</button>
            <button @click="startAnalysis('connessioni')"><Icon icon="lucide:link-2" :width="16" :height="16" style="vertical-align: middle" /> Solo connessioni</button>
          </div>
        </div>

        <button class="btn-testo" :class="{ active: textInputOpen }" @click="textInputOpen = !textInputOpen" title="Aggiungi nota testuale"><Icon icon="lucide:pen-line" :width="16" :height="16" style="vertical-align: middle" /></button>
        <button class="btn-refresh" @click="loadNotes"><Icon icon="lucide:refresh-cw" :width="16" :height="16" style="vertical-align: middle" /></button>
        <button class="btn-8bit" @click="toggle8bit" :title="pixel8bit ? 'Modalità normale' : 'Modalità 8-bit'"><Icon :icon="pixel8bit ? 'lucide:monitor' : 'lucide:gamepad-2'" :width="16" :height="16" style="vertical-align: middle" /></button>
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
          <button class="btn-save" :disabled="!textInput.trim()" @click="addTextNote"><Icon icon="lucide:check" :width="16" :height="16" style="vertical-align: middle" /> Aggiungi nota</button>
          <button class="btn-cancel" @click="textInputOpen = false; textInput = ''">Annulla</button>
          <span class="testo-hint">⌘↵ per salvare</span>
        </div>
      </div>
    </transition>

    <nav class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'note' }]" @click="activeTab = 'note'"><Icon icon="lucide:clipboard-list" :width="20" :height="20" style="vertical-align: middle" /> Note</button>
      <button :class="['tab-btn', { active: activeTab === 'stats' }]" @click="activeTab = 'stats'"><Icon icon="lucide:bar-chart-2" :width="20" :height="20" style="vertical-align: middle" /> Stats</button>
      <button :class="['tab-btn', { active: activeTab === 'archivio' }]" @click="openArchiveTab">📁 Archivio</button>
      <button :class="['tab-btn', { active: activeTab === 'chat' }]" @click="activeTab = 'chat'"><Icon icon="lucide:message-circle" :width="20" :height="20" style="vertical-align: middle" /> Chat</button>
    </nav>

    <transition name="slide">
      <BackofficeAnalysisPanel
        v-if="analysis"
        v-model:editing-event-idx="editingEventIdx"
        v-model:editing-event="editingEvent"
        v-model:editing-summary="editingSummary"
        v-model:editing-summary-val="editingSummaryVal"
        v-model:editing-suggestion-idx="editingSuggestionIdx"
        v-model:editing-suggestion="editingSuggestion"
        v-model:editing-connection-idx="editingConnectionIdx"
        v-model:editing-connection="editingConnection"
        :analysis="analysis"
        :collapsed="analysisCollapsed"
        :format-date="formatDate"
        :build-calendar-url="buildCalendarUrl"
        :start-summary-edit="startSummaryEdit"
        :save-summary="saveSummary"
        :start-event-edit="startEventEdit"
        :save-event-edit="saveEventEdit"
        :cancel-event-edit="cancelEventEdit"
        :start-suggestion-edit="startSuggestionEdit"
        :save-suggestion="saveSuggestion"
        :start-connection-edit="startConnectionEdit"
        :save-connection="saveConnection"
        @toggle-collapsed="analysisCollapsed = !analysisCollapsed"
        @close="analysis = null"
      />
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

    <div v-if="analysisError" class="error-bar"><Icon icon="lucide:triangle-alert" :width="16" :height="16" style="vertical-align: middle" /> {{ analysisError }}</div>

    <!-- NOTE LIST -->
    <BackofficeNotesTab
      v-if="activeTab === 'note'"
      v-model:editing-text="editingText"
      :loading="loading"
      :grouped-by-day="groupedByDay"
      :open-days="openDays"
      :all-selected="allSelected"
      :some-selected="someSelected"
      :selected-ids="selectedIds"
      :editing-id="editingId"
      :expanded-ids="expandedIds"
      :retranscribing-ids="retranscribingIds"
      :format-time="formatTime"
      :media-url="mediaUrl"
      :toggle-all="toggleAll"
      :toggle-day="toggleDay"
      :toggle-select="toggleSelect"
      :delete-note="deleteNote"
      :cancel-edit="cancelEdit"
      :save-edit="saveEdit"
      :start-edit="startEdit"
      :toggle-expand="toggleExpand"
      :retranscribe="retranscribe"
    />

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
          <h3 class="stat-title"><Icon icon="lucide:calendar" :width="18" :height="18" style="vertical-align: middle" /> Giorno della settimana</h3>
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
              <button class="btn-edit-title" @click="startTitleEdit(entry)"><Icon icon="lucide:pencil" :width="16" :height="16" style="vertical-align: middle" /></button>
            </template>
          </div>
          <div class="arch-body">
            <div class="arch-meta">
              <div class="arch-date">{{ formatDate(entry.generatoIl) }}</div>
              <div class="arch-tipi">
                <span v-for="t in (entry.tipi || [])" :key="t" class="arch-chip">{{ typeLabel(t) }}</span>
                <span v-if="entry.power" class="power-badge" :title="`${entry.power.joules} J totali`"><Icon icon="lucide:zap" :width="14" :height="14" style="vertical-align: middle" /> {{ entry.power.watts }} W · {{ entry.power.tokPerSec }} tok/s · {{ entry.power.elapsed }}s</span>
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
              <button class="btn-arch-del" @click="deleteArchiveEntry(entry.id)"><Icon icon="lucide:x" :width="16" :height="16" style="vertical-align: middle" /></button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- CHAT -->
    <div v-else class="chat-wrap">
      <div class="chat-messages" ref="chatScrollEl">
        <div v-if="chatMessages.length === 0 && !chatLoading" class="chat-empty">
          <div class="chat-empty-icon"><Icon :icon="chatMode === 'free' ? 'lucide:bot' : chatMode === 'notes' ? 'lucide:clipboard-list' : 'lucide:pencil'" :width="32" :height="32" style="vertical-align: middle" /></div>
          <div>{{ chatMode === 'free' ? 'Chat diretta con il modello AI' : chatMode === 'notes' ? 'Cerca nelle note vocali' : 'Correggi il recap corrente' }}</div>
          <div class="chat-suggestions">
            <template v-if="chatMode === 'free'">
              <button class="chip" @click="sendChip('Come funziona il Mixture of Experts?')">Come funziona il MoE?</button>
              <button class="chip" @click="sendChip('Spiega cos\'è la quantizzazione dei modelli AI')">Cos'è la quantizzazione?</button>
              <button class="chip" @click="sendChip('Quali sono i vantaggi di eseguire LLM in locale?')">LLM in locale: vantaggi?</button>
            </template>
            <template v-else-if="chatMode === 'notes'">
              <button class="chip" @click="sendChip('Cosa ho detto oggi?')">Cosa ho detto oggi?</button>
              <button class="chip" @click="sendChip('Riassumi le note più recenti')">Riassumi le note</button>
              <button class="chip" @click="sendChip('Ci sono appuntamenti o task?')">Appuntamenti o task?</button>
            </template>
          </div>
        </div>
        <template v-else>
          <div v-for="(msg, i) in chatMessages" :key="i" :class="['bubble-row', msg.role]">
            <div class="bubble-wrap">
              <div v-if="msg.role === 'assistant'" class="bubble md-bubble" v-html="renderMarkdown(msg.content)"></div>
              <div v-else class="bubble">{{ msg.content }}</div>
              <span v-if="msg.patched" class="patch-applied-badge"><Icon icon="lucide:check" :width="14" :height="14" style="vertical-align: middle" /> Recap aggiornato</span>
              <span v-if="msg.notesUsed > 0" class="notes-used-badge"><Icon icon="lucide:file-text" :width="14" :height="14" style="vertical-align: middle" /> {{ msg.notesUsed }} {{ msg.notesUsed > 1 ? 'note' : 'nota' }}</span>
            </div>
          </div>
          <div v-if="chatLoading" class="bubble-row assistant">
            <div v-if="chatStreamingDisplayed" class="bubble md-bubble stream-bubble" v-html="renderMarkdown(chatStreamingDisplayed) + '<span class=\'stream-cursor\'>▋</span>'"></div>
            <div v-else class="bubble typing"><span></span><span></span><span></span></div>
          </div>
        </template>
      </div>
      <div v-if="chatMode === 'recap' && analysis" class="recap-sec-bar">
        <button
          v-for="s in recapSections" :key="s.key"
          :class="['recap-sec-btn', { active: recapSection === s.key }]"
          @click="recapSection = s.key"
        >{{ s.label }}</button>
      </div>
      <div class="chat-mode-bar">
        <button :class="['chat-mode-btn', { active: chatMode === 'free' }]" @click="setChatMode('free')"><Icon icon="lucide:message-circle" :width="16" :height="16" style="vertical-align: middle" /> Libera</button>
        <button :class="['chat-mode-btn', { active: chatMode === 'notes' }]" @click="setChatMode('notes')"><Icon icon="lucide:clipboard-list" :width="16" :height="16" style="vertical-align: middle" /> Note</button>
        <button
          :class="['chat-mode-btn', { active: chatMode === 'recap' }]"
          :disabled="!analysis"
          :title="!analysis ? 'Esegui prima un\'analisi' : ''"
          @click="setChatMode('recap')"
        ><Icon icon="lucide:pencil" :width="16" :height="16" style="vertical-align: middle" /> Recap</button>
      </div>

      <div v-if="chatMode === 'notes'" class="note-selector-bar">
        <button class="note-sel-toggle" @click="chatNoteSelectorOpen = !chatNoteSelectorOpen">
          <span v-if="chatNoteIds.length === 0"><Icon icon="lucide:search" :width="16" :height="16" style="vertical-align: middle" /> Auto ({{ chatableNotes.length }} note)</span>
          <span v-else><Icon icon="lucide:pin" :width="16" :height="16" style="vertical-align: middle" /> {{ chatNoteIds.length }} {{ chatNoteIds.length > 1 ? 'note selezionate' : 'nota selezionata' }}</span>
          <span class="note-sel-arrow">{{ chatNoteSelectorOpen ? '▴' : '▾' }}</span>
        </button>
        <button v-if="chatNoteIds.length > 0" class="note-sel-reset" @click="chatNoteIds = []" title="Torna alla selezione automatica"><Icon icon="lucide:x" :width="14" :height="14" style="vertical-align: middle" /></button>
        <div v-if="chatNoteSelectorOpen" class="note-sel-list">
          <button
            v-for="n in chatableNotes"
            :key="n.id"
            :class="['note-sel-chip', { selected: chatNoteIds.includes(n.id) }]"
            @click="toggleChatNote(n.id)"
          >
            <span class="nsc-date">{{ noteChipLabel(n).date }} {{ noteChipLabel(n).time }}</span>
            <span class="nsc-preview">{{ noteChipLabel(n).preview }}</span>
          </button>
        </div>
      </div>

      <div class="chat-input-row">
        <textarea
          v-model="chatInput"
          class="chat-input"
          :placeholder="chatMode === 'free' ? 'Chatta con il modello...' : chatMode === 'notes' ? 'Cerca nelle note...': 'Chiedi di correggere il recap...'"
          rows="1"
          :disabled="chatLoading"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <button v-if="chatLoading" class="chat-stop" @click="stopChat"><Icon icon="lucide:square" :width="16" :height="16" style="vertical-align: middle" /></button>
        <button v-else class="chat-send" :disabled="!chatInput.trim()" @click="sendMessage"><Icon icon="lucide:send" :width="16" :height="16" style="vertical-align: middle" /></button>
      </div>
      <div v-if="contextSize > 0 && lastTokensUsed > 0" class="ctx-bar-wrap">
        <div class="ctx-bar-track">
          <div
            class="ctx-bar-fill"
            :style="{ width: Math.min(lastTokensUsed / contextSize * 100, 100) + '%' }"
            :class="{
              'ctx-warn': lastTokensUsed / contextSize > 0.6,
              'ctx-danger': lastTokensUsed / contextSize > 0.85,
            }"
          ></div>
        </div>
        <span class="ctx-bar-label">
          {{ lastTokensUsed.toLocaleString() }} / {{ contextSize.toLocaleString() }} tok
          ({{ Math.round(lastTokensUsed / contextSize * 100) }}%)
        </span>
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

</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { marked } from "marked";
import BackofficeAnalysisPanel from "../components/backoffice/BackofficeAnalysisPanel.vue";
import BackofficeNotesTab from "../components/backoffice/BackofficeNotesTab.vue";
import DeviceBadge from "../components/DeviceBadge.vue";
import { useJobPoller } from "../composables/useJobPoller.js";
import { useNotesCollection } from "../composables/useNotesCollection.js";
import { useApi } from "../composables/useApi.js";
import { buildStats, buildCalendarUrl, filterNotes, groupNotesByDay, RECAP_SECTIONS, TYPE_LABELS } from "../utils/backoffice.js";
import { formatDateTime, formatTimeOnly } from "../utils/dateTime.js";

const { apiFetch, mediaUrl } = useApi();

marked.setOptions({ breaks: true, gfm: true });
function renderMarkdown(text) {
  return marked.parse(text || "");
}
const { pollJob } = useJobPoller(apiFetch);
const {
  notes,
  loading,
  loadNotes,
  removeNote,
  updateNote,
  startPolling,
} = useNotesCollection(apiFetch);

const confirmModal = ref({ visible: false, message: "", onConfirm: () => {} });
function showConfirmModal(message, onConfirm) {
  confirmModal.value = { visible: true, message, onConfirm };
}

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
const audioUploading = ref(false);
const audioUploadProgress = ref("");
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
const chatStreamingDisplayed = ref("");
const chatAbortController = ref(null);
const chatJobId = ref(null);
const contextSize = ref(0);
const lastTokensUsed = ref(0);
let _typewriterTimer = null;

watch(chatStreaming, (newText) => {
  if (_typewriterTimer) { clearInterval(_typewriterTimer); _typewriterTimer = null; }
  if (!newText) { chatStreamingDisplayed.value = ""; return; }

  const startLen = chatStreamingDisplayed.value.length;
  const newChars = newText.length - startLen;
  if (newChars <= 0) { chatStreamingDisplayed.value = newText; return; }

  const charDelay = Math.max(8, Math.min(40, 1200 / newChars));
  let pos = startLen;
  _typewriterTimer = setInterval(() => {
    pos++;
    chatStreamingDisplayed.value = newText.slice(0, pos);
    if (pos >= newText.length) { clearInterval(_typewriterTimer); _typewriterTimer = null; }
  }, charDelay);
});

const chatMode = ref("free");
const recapSection = ref("tutti");
const chatNoteIds = ref([]);
const chatNoteSelectorOpen = ref(false);
const pixel8bit = ref(localStorage.getItem("mode-8bit") === "1");
const retranscribingIds = ref(new Set());
const openDays = ref(new Set());

const recapSections = RECAP_SECTIONS;

const chatableNotes = computed(() =>
  notes.value.filter((n) => n.status === "completata" && (n.testo_pulito || n.testo))
);

function noteChipLabel(n) {
  const d = new Date(n.createdAt);
  const date = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const preview = (n.sintesi || n.testo_pulito || n.testo || "").slice(0, 45).replace(/\n/g, " ");
  return { date, time, preview };
}

function toggleChatNote(id) {
  const idx = chatNoteIds.value.indexOf(id);
  if (idx === -1) chatNoteIds.value.push(id);
  else chatNoteIds.value.splice(idx, 1);
}

function setChatMode(mode) {
  if (mode === chatMode.value) return;
  chatMode.value = mode;
  chatMessages.value = [];
  chatHistory.value = [];
  chatNoteIds.value = [];
  chatNoteSelectorOpen.value = false;
}

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
const stats = computed(() => buildStats(notes.value));

watch(activeTab, (tab) => {
  analysisCollapsed.value = tab === "chat";
});

watch(activeLogs, () => {
  nextTick(() => { if (logPanel.value) logPanel.value.scrollTop = logPanel.value.scrollHeight; });
}, { deep: true });

watch(chatMessages, () => {
  nextTick(() => { if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight; });
}, { deep: true });

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

function clearSelection() {
  selectedIds.value = new Set();
}

const filtered = computed(() => filterNotes(notes.value, search.value));
const groupedByDay = computed(() => groupNotesByDay(filtered.value));

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

const formatDate = formatDateTime;
const formatTime = formatTimeOnly;

async function startCleanup() {
  cleanupLoading.value = true;
  analysisError.value = null;
  analysisStreaming.value = "";
  try {
    const res = await apiFetch("/api/pulisci", { method: "POST" });
    const { jobId } = await res.json();
    await pollJob(
      jobId,
      {
        onDone: async () => {
          analysisStreaming.value = "";
          await loadNotes();
        },
        onError: (err) => { analysisError.value = err; },
        onLogs: (logs) => { analysisLogs.value = logs; },
        onStream: (text) => { analysisStreaming.value = text; },
      },
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
      {
        onDone: (result) => {
          analysisStreaming.value = "";
          analysis.value = result;
        },
        onError: (err) => { analysisError.value = err; },
        onLogs: (logs) => { analysisLogs.value = logs; },
        onStream: (text) => { analysisStreaming.value = text; },
      },
    );
  } catch (err) {
    analysisError.value = err.message;
  } finally {
    analysisLoading.value = false;
    analysisStreaming.value = "";
  }
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
  updateNote(nota.id, (note) => ({ ...note, [field]: editingText.value }), { sync: false });
  cancelEdit();
}

function deleteNote(id) {
  showConfirmModal("Vuoi eliminare questa nota? L'operazione non può essere annullata.", async () => {
    await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
    removeNote(id);
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
  chatAbortController.value = new AbortController();
  try {
    const useRecap = chatMode.value === "recap" && analysis.value;
    const endpoint = useRecap ? "/api/chat-recap" : "/api/chat";
    const analysisContext = useRecap
        ? (recapSection.value === "tutti" ? analysis.value : { [recapSection.value]: analysis.value[recapSection.value] })
      : null;
    const body = useRecap
      ? { question, history: chatHistory.value, analysis: analysisContext }
      : { question, history: chatHistory.value, mode: chatMode.value, noteIds: chatNoteIds.value.length > 0 ? chatNoteIds.value : null };
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { jobId } = await res.json();
    chatJobId.value = jobId;
    await pollJob(
      jobId,
      {
        signal: chatAbortController.value.signal,
        onDone: (result) => {
          chatStreaming.value = "";
          const reply = result.reply || "Nessuna risposta.";
          const patch = result.patch || null;
          if (patch) applyPatch(patch);
          if (result.tokensUsed) lastTokensUsed.value = result.tokensUsed;
          chatMessages.value.push({ role: "assistant", content: reply, patched: !!patch, notesUsed: result.notesUsed || 0 });
          chatHistory.value.push({ user: question, assistant: reply });
        },
        onError: (err) => {
          chatMessages.value.push({ role: "assistant", content: `⚠️ Errore: ${err}` });
        },
        onLogs: (logs) => { chatLogs.value = logs; },
        onStream: (text) => { chatStreaming.value = text; },
      },
    );
  } catch (err) {
    if (!chatAbortController.value?.signal.aborted)
      chatMessages.value.push({ role: "assistant", content: `⚠️ Errore: ${err.message}` });
  } finally {
    chatLoading.value = false;
    chatStreaming.value = "";
    chatLogs.value = [];
    chatAbortController.value = null;
    chatJobId.value = null;
  }
}

function stopChat() {
  chatAbortController.value?.abort();
  if (chatJobId.value) {
    apiFetch(`/api/job/${chatJobId.value}/cancel`, { method: "POST" }).catch(() => {});
    chatJobId.value = null;
  }
}

function typeLabel(type) {
  return TYPE_LABELS[type] || type;
}

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

async function openArchiveTab() {
  activeTab.value = "archivio";
  await loadArchive();
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

function replaceAnalysisSection(section, value) {
  if (!analysis.value) return;
  analysis.value = {
    ...analysis.value,
    [section]: value,
  };
}

function startEventEdit(ev, idx) {
  editingEventIdx.value = idx;
  editingEvent.value = { ...ev };
}

async function saveEventEdit() {
  if (editingEventIdx.value === null) return;
  const events = [...(analysis.value.eventi?.eventi || [])];
  events[editingEventIdx.value] = { ...editingEvent.value };
  replaceAnalysisSection("eventi", {
    ...analysis.value.eventi,
    eventi: events,
  });
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
  replaceAnalysisSection("riassunto", {
    ...editingSummaryVal.value,
    argomenti: editingSummaryVal.value.argomenti.split("\n").map((s) => s.trim()).filter(Boolean),
  });
  editingSummary.value = false;
  await patchAnalysisArchive({ riassunto: analysis.value.riassunto });
}

function startSuggestionEdit(s, idx) {
  editingSuggestionIdx.value = idx;
  editingSuggestion.value = { ...s };
}

async function saveSuggestion() {
  if (editingSuggestionIdx.value === null) return;
  const suggestions = [...(analysis.value.suggerimenti?.suggerimenti || [])];
  suggestions[editingSuggestionIdx.value] = { ...editingSuggestion.value };
  replaceAnalysisSection("suggerimenti", {
    ...analysis.value.suggerimenti,
    suggerimenti: suggestions,
  });
  editingSuggestionIdx.value = null;
  await patchAnalysisArchive({ suggerimenti: analysis.value.suggerimenti });
}

function startConnectionEdit(c, idx) {
  editingConnectionIdx.value = idx;
  editingConnection.value = { ...c, note: (c.note || []).join("\n") };
}

async function saveConnection() {
  if (editingConnectionIdx.value === null) return;
  const connections = [...(analysis.value.connessioni?.connessioni || [])];
  connections[editingConnectionIdx.value] = {
    ...editingConnection.value,
    note: editingConnection.value.note.split("\n").map((s) => s.trim()).filter(Boolean),
  };
  replaceAnalysisSection("connessioni", {
    ...analysis.value.connessioni,
    connessioni: connections,
  });
  editingConnectionIdx.value = null;
  await patchAnalysisArchive({ connessioni: analysis.value.connessioni });
}

async function retranscribe(nota) {
  retranscribingIds.value = new Set([...retranscribingIds.value, nota.id]);
  await apiFetch(`/api/notes/${nota.id}/retranscribe`, { method: "POST" });
  updateNote(
    nota.id,
    (note) => ({ ...note, status: "in_elaborazione", testo: null }),
    { pollMs: 3000 },
  );
  retranscribingIds.value = new Set([...retranscribingIds.value].filter((id) => id !== nota.id));
  startPolling(3000);
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

async function exportNotes() {
  const res = await apiFetch("/api/notes");
  const allNotes = await res.json();
  const exportedNotes = selectedIds.value.size > 0
    ? allNotes.filter((note) => selectedIds.value.has(note.id))
    : allNotes;
  const blob = new Blob([JSON.stringify(exportedNotes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `note-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importAudio(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  e.target.value = "";
  audioUploading.value = true;
  let done = 0;
  for (const file of files) {
    audioUploadProgress.value = files.length > 1 ? `${done + 1}/${files.length}` : "";
    try {
      const form = new FormData();
      form.append("audio", file, file.name);
      await apiFetch("/api/audio", { method: "POST", body: form });
    } catch (err) {
      console.error("[ImportAudio]", file.name, err);
    }
    done++;
  }
  audioUploading.value = false;
  audioUploadProgress.value = "";
  await loadNotes();
  startPolling(3000);
}

async function importNotes(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await apiFetch("/api/notes/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const { imported } = await res.json();
    await loadNotes();
    if (imported === 0) alert("Nessuna nota nuova da importare.");
    else alert(`${imported} note importate.`);
  } catch {
    alert("Errore durante l'importazione. Verifica il formato del file.");
  }
}

function toggle8bit() {
  pixel8bit.value = !pixel8bit.value;
  document.body.classList.toggle("mode-8bit", pixel8bit.value);
  localStorage.setItem("mode-8bit", pixel8bit.value ? "1" : "0");
}

onMounted(async () => {
  loadNotes();
  if (pixel8bit.value) document.body.classList.add("mode-8bit");
  try {
    const res = await apiFetch("/api/config");
    const cfg = await res.json();
    if (cfg.contextSize) contextSize.value = cfg.contextSize;
  } catch {}
});
</script>

<style scoped>
.bo { display: flex; flex-direction: column; height: 100vh; font-family: 'Figtree', -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f7; color: #1d1d1f; }

.bo-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: #0E294B; border-bottom: 1px solid rgba(255,255,255,0.08); gap: 12px; }
.bo-header h1 { font-size: 18px; font-weight: 700; white-space: nowrap; color: #fff; }
.header-brand { display: flex; align-items: center; gap: 8px; }
.header-logo { height: 44px; width: auto; flex-shrink: 0; }
.header-right { display: flex; gap: 10px; align-items: center; flex: 1; justify-content: flex-end; min-width: 0; flex-wrap: nowrap; }

.search { padding: 8px 14px; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; font-size: 14px; width: 200px; min-width: 120px; outline: none; background: rgba(255,255,255,0.1); color: #fff; flex-shrink: 1; }
.search::placeholder { color: rgba(255,255,255,0.4); }
.search:focus { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.15); }

.btn-pulisci { padding: 8px 16px; background: #34c759; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-pulisci:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-io { padding: 8px 14px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-io:hover { background: rgba(255,255,255,0.2); }
.btn-audio-import:disabled { opacity: 0.7; cursor: not-allowed; }

.analisi-split { position: relative; display: flex; }
.btn-analisi { padding: 8px 14px; background: #5856d6; color: #fff; border: none; border-radius: 10px 0 0 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-analisi:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-analisi-arrow { padding: 8px 10px; background: #4a48c0; color: #fff; border: none; border-left: 1px solid #6e6cd4; border-radius: 0 10px 10px 0; font-size: 12px; cursor: pointer; }
.btn-analisi-arrow:disabled { opacity: 0.6; cursor: not-allowed; }
.analisi-dropdown { position: absolute; top: calc(100% + 6px); right: 0; background: #fff; border: 1px solid #e5e5ea; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); min-width: 200px; z-index: 100; overflow: hidden; }
.analisi-dropdown button { display: block; width: 100%; padding: 11px 16px; text-align: left; background: none; border: none; font-size: 14px; color: #1d1d1f; cursor: pointer; }
.analisi-dropdown button:hover { background: #f5f5f7; }
.analisi-dropdown button + button { border-top: 1px solid #f2f2f7; }

.btn-testo { padding: 8px 12px; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; background: rgba(255,255,255,0.1); font-size: 16px; cursor: pointer; transition: background 0.15s; }
.btn-testo:hover { background: rgba(255,255,255,0.2); }
.btn-testo.active { background: rgba(255,149,0,0.25); border-color: #ff9500; }
.testo-panel { background: #fff; border-bottom: 1px solid #e5e5ea; padding: 16px 24px; display: flex; flex-direction: column; gap: 10px; }
.testo-area { width: 100%; padding: 10px 14px; border: 1.5px solid #e5e5ea; border-radius: 12px; font-size: 14px; font-family: inherit; resize: vertical; outline: none; line-height: 1.5; box-sizing: border-box; }
.testo-area:focus { border-color: #007aff; }
.testo-actions { display: flex; align-items: center; gap: 8px; }
.testo-hint { font-size: 12px; color: #c7c7cc; margin-left: 4px; }
.btn-refresh { padding: 8px 12px; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; background: rgba(255,255,255,0.1); font-size: 16px; cursor: pointer; color: #fff; }
.btn-8bit { padding: 8px 12px; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; background: rgba(255,255,255,0.1); font-size: 18px; cursor: pointer; transition: transform 0.1s; }
.btn-8bit:hover { transform: scale(1.15); background: rgba(255,255,255,0.2); }

.sel-badge { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(255,255,255,0.15); color: #fff; border-radius: 10px; font-size: 13px; font-weight: 600; white-space: nowrap; border: 1px solid rgba(255,255,255,0.2); }
.sel-clear { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.7); font-size: 14px; padding: 0; line-height: 1; }
.cb { width: 16px; height: 16px; cursor: pointer; accent-color: #5856d6; }
.cell-cb { width: 36px; text-align: center; padding: 14px 8px; }
tbody tr.selected { background: #f0efff; }
tbody tr.selected:hover { background: #e8e7ff; }

.tab-bar { display: flex; gap: 4px; padding: 8px 24px 0; background: #0E294B; border-bottom: 1px solid rgba(255,255,255,0.08); }
.tab-btn { padding: 8px 18px; border: none; background: none; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.45); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab-btn.active { color: #fff; border-bottom-color: #fff; font-weight: 600; }
.tab-btn:hover:not(.active) { color: rgba(255,255,255,0.8); }

.power-badge { display: inline-flex; align-items: center; gap: 3px; background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 20px; padding: 2px 10px; font-size: 12px; font-weight: 600; cursor: default; }
.empty { text-align: center; color: #8e8e93; padding: 60px; }
.muted { color: #c7c7cc; font-style: italic; }

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

.table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
thead th { background: #0E294B; padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.5px; }
tbody tr { border-top: 1px solid #f2f2f7; transition: background 0.15s; }
tbody tr:hover { background: #fafafa; }
tbody tr.pending { opacity: 0.7; }
td { padding: 14px 16px; vertical-align: middle; font-size: 14px; }
.cell-date { color: #8e8e93; font-size: 13px; white-space: nowrap; }
.cell-audio audio { width: 160px; height: 32px; }
.cell-status { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
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
.md-bubble { white-space: normal; }
.md-bubble :deep(p) { margin: 0 0 8px; }
.md-bubble :deep(p:last-child) { margin-bottom: 0; }
.md-bubble :deep(h1),.md-bubble :deep(h2),.md-bubble :deep(h3),.md-bubble :deep(h4) { margin: 12px 0 6px; font-weight: 700; line-height: 1.3; }
.md-bubble :deep(h1) { font-size: 17px; }
.md-bubble :deep(h2) { font-size: 15px; }
.md-bubble :deep(h3) { font-size: 14px; }
.md-bubble :deep(ul),.md-bubble :deep(ol) { margin: 6px 0; padding-left: 20px; }
.md-bubble :deep(li) { margin-bottom: 4px; }
.md-bubble :deep(strong) { font-weight: 700; }
.md-bubble :deep(em) { font-style: italic; }
.md-bubble :deep(code) { font-family: monospace; font-size: 13px; background: rgba(0,0,0,0.07); padding: 1px 5px; border-radius: 4px; }
.md-bubble :deep(pre) { background: rgba(0,0,0,0.07); border-radius: 8px; padding: 10px 12px; overflow-x: auto; margin: 8px 0; }
.md-bubble :deep(pre code) { background: none; padding: 0; }
.md-bubble :deep(blockquote) { border-left: 3px solid #c7c7cc; margin: 8px 0; padding-left: 12px; color: #6e6e73; }
.stream-cursor { display: inline-block; width: 2px; height: 1em; background: #1d1d1f; margin-left: 2px; vertical-align: text-bottom; animation: blink 0.8s step-end infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
.bubble-row.user .bubble { background: #007aff; color: #fff; border-bottom-right-radius: 4px; }
.bubble-row.assistant .bubble { background: #fff; color: #1d1d1f; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.patch-applied-badge { align-self: flex-start; padding: 4px 10px; background: #e8faea; color: #1a7f37; border-radius: 20px; font-size: 12px; font-weight: 600; }
.chat-mode-bar { display: flex; gap: 6px; padding: 8px 16px 0; }
.chat-mode-btn { padding: 6px 14px; border: 1.5px solid #e5e5ea; border-radius: 20px; background: #fff; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.chat-mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.chat-mode-btn.active { background: #007aff; border-color: #007aff; color: #fff; }
.notes-used-badge { display: inline-block; font-size: 11px; color: #007aff; background: #e8f0ff; border-radius: 20px; padding: 2px 8px; margin-top: 4px; }
.btn-retranscribe { background: none; border: none; color: #007aff; font-size: 12px; cursor: pointer; padding: 0 4px; text-decoration: underline; }
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
.chat-stop { width: 40px; height: 40px; background: #ff3b30; color: #fff; border: none; border-radius: 50%; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
.chat-stop:hover { background: #d70015; }
.note-selector-bar { background: #f9f9fb; border-top: 1px solid #e5e5ea; padding: 8px 16px; position: relative; }
.note-sel-toggle { display: flex; align-items: center; gap: 6px; background: none; border: 1.5px solid #e5e5ea; border-radius: 8px; padding: 5px 10px; font-size: 13px; color: #3a3a3c; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
.note-sel-toggle:hover { border-color: #007aff; }
.note-sel-arrow { margin-left: 4px; font-size: 10px; color: #8e8e93; }
.note-sel-reset { margin-left: 8px; background: none; border: none; color: #8e8e93; font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1; }
.note-sel-reset:hover { color: #ff3b30; }
.note-sel-list { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; }
.note-sel-chip { display: flex; align-items: baseline; gap: 8px; padding: 6px 10px; border-radius: 8px; border: 1.5px solid #e5e5ea; background: #fff; cursor: pointer; text-align: left; font-family: inherit; transition: all 0.12s; }
.note-sel-chip:hover { border-color: #007aff; background: #f0f5ff; }
.note-sel-chip.selected { border-color: #007aff; background: #e8f0ff; }
.nsc-date { font-size: 11px; font-weight: 700; color: #007aff; white-space: nowrap; flex-shrink: 0; }
.nsc-preview { font-size: 12px; color: #3a3a3c; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ctx-bar-wrap { display: flex; align-items: center; gap: 10px; padding: 0 24px 10px; background: #fff; }
.ctx-bar-track { flex: 1; height: 4px; background: #e5e5ea; border-radius: 4px; overflow: hidden; }
.ctx-bar-fill { height: 100%; background: #34c759; border-radius: 4px; transition: width 0.4s ease, background 0.4s ease; }
.ctx-bar-fill.ctx-warn { background: #ff9500; }
.ctx-bar-fill.ctx-danger { background: #ff3b30; }
.ctx-bar-label { font-size: 11px; color: #8e8e93; white-space: nowrap; font-variant-numeric: tabular-nums; }

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

@media (max-width: 1200px) {
  .btn-io .btn-text { display: none; }
}

@media (max-width: 768px) {
  .bo-header { flex-wrap: wrap; padding: 10px 14px; gap: 8px; }
  .bo-header h1 { font-size: 15px; }
  .header-right { flex-wrap: wrap; gap: 8px; }
  .search { order: 10; width: 100%; }
  .btn-pulisci { font-size: 13px; padding: 8px 12px; }
  .btn-analisi { font-size: 13px; padding: 8px 10px; }
  .tab-bar { padding: 6px 14px 0; gap: 2px; }
  .tab-btn { padding: 8px 10px; font-size: 13px; }
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

<style>
/* ── 8-BIT MODE ─────────────────────────────────────── */
/* Palette
   --bg:      #0d1b2a  dark navy
   --bg2:     #112233  panels/cards
   --bg3:     #1a3348  hover
   --fg:      #74c69d  soft green text
   --fg2:     #b7e4c7  light green
   --accent:  #ff6b9d  magenta for primary actions
   --cyan:    #48cae4  AI bubbles
   --border:  #2d6a4f  border color
   --border2: #52b788  active border
   --yellow:  #ffd60a  highlights
*/

body.mode-8bit, body.mode-8bit * {
  font-family: 'Press Start 2P', monospace !important;
  border-radius: 0 !important;
  image-rendering: pixelated;
  transition: none !important;
}

/* Scanlines CRT overlay */
body.mode-8bit::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px);
  pointer-events: none;
  z-index: 99997;
}

body.mode-8bit { background: #0d1b2a !important; color: #74c69d !important; cursor: crosshair; }

/* ── Base: ogni div/elemento prende il dark navy ── */
body.mode-8bit .bo { background: #0d1b2a !important; color: #74c69d !important; }
body.mode-8bit .bo-header { background: #112233 !important; border-bottom: 3px solid #52b788 !important; box-shadow: 0 3px 0 #2d6a4f !important; }
body.mode-8bit .bo-header h1 { font-size: 9px !important; color: #b7e4c7 !important; text-shadow: 2px 2px 0 #2d6a4f !important; }

/* Tab bar */
body.mode-8bit .tab-bar { background: #112233 !important; border-bottom: 3px solid #52b788 !important; }
body.mode-8bit .tab-btn { color: #3a7d5a !important; font-size: 6px !important; }
body.mode-8bit .tab-btn.active { color: #74c69d !important; border-bottom: 3px solid #52b788 !important; background: transparent !important; }
body.mode-8bit .tab-btn:hover:not(.active) { color: #74c69d !important; background: #1a3348 !important; box-shadow: none !important; transform: none !important; }

/* Inputs */
body.mode-8bit input, body.mode-8bit textarea, body.mode-8bit select {
  background: #0d1b2a !important; color: #74c69d !important;
  border: 2px solid #52b788 !important; box-shadow: 3px 3px 0 #2d6a4f !important;
  font-size: 7px !important; outline: none !important;
}
body.mode-8bit input:focus, body.mode-8bit textarea:focus { border-color: #ff6b9d !important; box-shadow: 3px 3px 0 #8b1a4a !important; }
body.mode-8bit input::placeholder, body.mode-8bit textarea::placeholder { color: #3a7d5a !important; }

/* All buttons base */
body.mode-8bit button {
  background: #112233 !important; color: #74c69d !important;
  border: 2px solid #52b788 !important; box-shadow: 3px 3px 0 #2d6a4f !important;
  font-size: 7px !important; cursor: pointer !important;
}
body.mode-8bit button:hover:not(:disabled) {
  background: #52b788 !important; color: #0d1b2a !important;
  box-shadow: none !important; transform: translate(3px, 3px) !important;
}
body.mode-8bit button:disabled { opacity: 0.4 !important; }

/* Primary action buttons (verde scuro → magenta) */
body.mode-8bit .btn-pulisci, body.mode-8bit .btn-analisi, body.mode-8bit .chat-send {
  background: #ff6b9d !important; color: #0d1b2a !important;
  border-color: #ff6b9d !important; box-shadow: 3px 3px 0 #8b1a4a !important;
}
body.mode-8bit .btn-pulisci:hover, body.mode-8bit .btn-analisi:hover, body.mode-8bit .chat-send:hover {
  background: #0d1b2a !important; color: #ff6b9d !important;
}
body.mode-8bit .btn-analisi-arrow { background: #cc4477 !important; border-color: #ff6b9d !important; box-shadow: 3px 3px 0 #8b1a4a !important; color: #0d1b2a !important; }
body.mode-8bit .btn-save { background: #52b788 !important; color: #0d1b2a !important; border-color: #52b788 !important; }
body.mode-8bit .btn-modal-confirm { background: #ff6b9d !important; color: #0d1b2a !important; border-color: #ff6b9d !important; }
body.mode-8bit .btn-io { background: #1a3348 !important; color: #74c69d !important; border-color: #52b788 !important; }

/* Panels */
body.mode-8bit .analisi-panel, body.mode-8bit .testo-panel { background: #112233 !important; border-bottom: 2px solid #52b788 !important; }
body.mode-8bit .analisi-dropdown { background: #112233 !important; border: 2px solid #52b788 !important; box-shadow: 4px 4px 0 #2d6a4f !important; }
body.mode-8bit .analisi-dropdown button { color: #74c69d !important; font-size: 7px !important; border-top: 1px solid #2d6a4f !important; background: #112233 !important; box-shadow: none !important; }
body.mode-8bit .analisi-dropdown button:hover { background: #1a3348 !important; color: #b7e4c7 !important; transform: none !important; box-shadow: none !important; }

/* Analysis cards */
body.mode-8bit .acard { background: #1a3348 !important; border: 2px solid #2d6a4f !important; box-shadow: 3px 3px 0 #2d6a4f !important; }
body.mode-8bit .acard-title { color: #b7e4c7 !important; font-size: 7px !important; }
body.mode-8bit .evento, body.mode-8bit .suggerimento, body.mode-8bit .connessione { background: #112233 !important; border: 1px solid #2d6a4f !important; color: #74c69d !important; }
body.mode-8bit .connessione { border-left: 3px solid #ff6b9d !important; }
body.mode-8bit .evento-titolo, body.mode-8bit .sug-title { color: #b7e4c7 !important; font-size: 7px !important; }
body.mode-8bit .tag { background: #1a3348 !important; color: #74c69d !important; border: 1px solid #2d6a4f !important; font-size: 6px !important; }
body.mode-8bit .badge-prio.alta { background: #2d1a1a !important; color: #ff6b9d !important; border: 1px solid #ff6b9d !important; }
body.mode-8bit .badge-prio.media { background: #2d2a1a !important; color: #ffd60a !important; border: 1px solid #ffd60a !important; }
body.mode-8bit .badge-prio.bassa { background: #1a2d1a !important; color: #52b788 !important; border: 1px solid #52b788 !important; }

/* Table */
body.mode-8bit .notes-table-wrap { background: #0d1b2a !important; }
body.mode-8bit table, body.mode-8bit .table { background: #0d1b2a !important; box-shadow: none !important; }
body.mode-8bit th { background: #1a3348 !important; color: #b7e4c7 !important; font-size: 6px !important; border: 1px solid #2d6a4f !important; }
body.mode-8bit td { background: #112233 !important; color: #74c69d !important; font-size: 7px !important; border: 1px solid #1a3348 !important; }
body.mode-8bit tbody tr:hover td { background: #1a3348 !important; }
body.mode-8bit tbody tr.selected td { background: #1a3348 !important; border-color: #52b788 !important; }
body.mode-8bit .note-text { color: #74c69d !important; font-size: 7px !important; line-height: 1.8 !important; }
body.mode-8bit .note-text-clean { color: #48cae4 !important; }
body.mode-8bit .badge, body.mode-8bit .badge-status { background: #1a3348 !important; color: #74c69d !important; border: 1px solid #52b788 !important; font-size: 6px !important; }
body.mode-8bit .badge.completata { background: #1a2d1a !important; color: #52b788 !important; border-color: #52b788 !important; }
body.mode-8bit .badge.in_elaborazione { background: #2d2a1a !important; color: #ffd60a !important; border-color: #ffd60a !important; }
body.mode-8bit .badge-sentiment { background: #1a3348 !important; border: 1px solid #2d6a4f !important; color: #74c69d !important; font-size: 6px !important; }
body.mode-8bit .sintesi-text { color: #48cae4 !important; font-size: 7px !important; }
body.mode-8bit .label-pulito { background: #1a2d1a !important; color: #52b788 !important; font-size: 6px !important; }
body.mode-8bit .note-date { color: #3a7d5a !important; font-size: 6px !important; }
body.mode-8bit .error-bar { background: #2d1a1a !important; color: #ff6b9d !important; border: 1px solid #ff6b9d !important; }

/* Archive */
body.mode-8bit .archive-wrap { background: #0d1b2a !important; }
body.mode-8bit .archive-list { background: #0d1b2a !important; border-right: 2px solid #2d6a4f !important; }
body.mode-8bit .archive-item { background: #112233 !important; border: 2px solid #1a3348 !important; box-shadow: 3px 3px 0 #1a3348 !important; }
body.mode-8bit .archive-item:hover, body.mode-8bit .archive-item.active { border-color: #52b788 !important; box-shadow: 3px 3px 0 #2d6a4f !important; background: #1a3348 !important; }
body.mode-8bit .archive-title { color: #b7e4c7 !important; font-size: 7px !important; }
body.mode-8bit .archive-date { color: #3a7d5a !important; font-size: 6px !important; }
body.mode-8bit .recap-panel { background: #0d1b2a !important; }
body.mode-8bit .recap-section { background: #112233 !important; border: 2px solid #2d6a4f !important; box-shadow: 3px 3px 0 #2d6a4f !important; }
body.mode-8bit .recap-section-title { color: #ff6b9d !important; font-size: 7px !important; }
body.mode-8bit .recap-item { background: #1a3348 !important; color: #74c69d !important; border: 1px solid #2d6a4f !important; }
body.mode-8bit .archive-empty { color: #3a7d5a !important; }

/* Chat */
body.mode-8bit .chat-panel { background: #0d1b2a !important; }
body.mode-8bit .chat-messages { background: #0d1b2a !important; }
body.mode-8bit .chat-mode-pills { background: #112233 !important; border-bottom: 2px solid #52b788 !important; }
body.mode-8bit .pill { background: #112233 !important; color: #3a7d5a !important; border: 2px solid #2d6a4f !important; font-size: 6px !important; }
body.mode-8bit .pill.active { background: #52b788 !important; color: #0d1b2a !important; border-color: #52b788 !important; box-shadow: 2px 2px 0 #2d6a4f !important; }
body.mode-8bit .chat-input-row { background: #112233 !important; border-top: 2px solid #52b788 !important; }
body.mode-8bit .bubble-user { background: #1a3348 !important; color: #b7e4c7 !important; border: 2px solid #52b788 !important; box-shadow: 3px 3px 0 #2d6a4f !important; font-size: 7px !important; }
body.mode-8bit .bubble-ai { background: #0d1b2a !important; color: #48cae4 !important; border: 2px solid #48cae4 !important; box-shadow: 3px 3px 0 #1a4a6a !important; font-size: 7px !important; }
body.mode-8bit .typing-dots span { background: #74c69d !important; }

/* Modals */
body.mode-8bit .modal-overlay { background: rgba(0,20,40,0.88) !important; }
body.mode-8bit .modal-box { background: #112233 !important; border: 3px solid #52b788 !important; box-shadow: 6px 6px 0 #2d6a4f !important; color: #74c69d !important; }
body.mode-8bit .modal-box h3 { color: #ff6b9d !important; font-size: 9px !important; }
body.mode-8bit .btn-modal-cancel { background: #1a3348 !important; color: #74c69d !important; border-color: #52b788 !important; }

/* Sel / power badges */
body.mode-8bit .sel-badge { background: #1a3348 !important; color: #74c69d !important; border: 2px solid #52b788 !important; font-size: 6px !important; }
body.mode-8bit .sel-clear { color: #74c69d !important; }
body.mode-8bit .power-badge { background: #2d2a1a !important; color: #ffd60a !important; border: 2px solid #ffd60a !important; box-shadow: 3px 3px 0 #5a4a00 !important; font-size: 6px !important; }

/* Log panel */
body.mode-8bit .log-panel { background: #060f17 !important; border: 2px solid #2d6a4f !important; color: #52b788 !important; }
body.mode-8bit .log-line { color: #3a7d5a !important; font-size: 6px !important; }
body.mode-8bit .log-streaming-text { color: #ffd60a !important; font-size: 6px !important; }
body.mode-8bit .log-streaming-label { color: #3a7d5a !important; }

/* Misc */
body.mode-8bit .stat-card { background: #112233 !important; border: 2px solid #2d6a4f !important; box-shadow: 3px 3px 0 #2d6a4f !important; color: #74c69d !important; }
body.mode-8bit .btn-collapse-panel { background: #1a3348 !important; color: #74c69d !important; border-color: #2d6a4f !important; }
body.mode-8bit .close-btn { color: #52b788 !important; background: transparent !important; border: none !important; box-shadow: none !important; }
body.mode-8bit .testo-hint { color: #3a7d5a !important; }
body.mode-8bit .analisi-header { color: #3a7d5a !important; }
body.mode-8bit .analisi-error { color: #ff6b9d !important; font-size: 7px !important; }

/* Scrollbars */
body.mode-8bit ::-webkit-scrollbar { width: 8px; background: #0d1b2a; }
body.mode-8bit ::-webkit-scrollbar-thumb { background: #52b788; }
body.mode-8bit ::-webkit-scrollbar-track { background: #112233; }

@keyframes blink8 { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
</style>
