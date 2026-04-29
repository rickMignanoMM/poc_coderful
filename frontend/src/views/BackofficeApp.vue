<template>
  <div class="bo">
    <header class="bo-header">
      <h1>📋 Backoffice Note Audio</h1>
      <div class="header-right">
        <input v-model="search" class="search" placeholder="Cerca nelle trascrizioni..." />
        <button class="btn-pulisci" :disabled="pulisciLoading || analisiLoading" @click="avviaPulizia">
          {{ pulisciLoading ? "⏳ Pulizia in corso..." : "✨ Sistema note" }}
        </button>

        <!-- SPLIT BUTTON ANALISI -->
        <div class="analisi-split" v-click-outside="() => analisiMenuOpen = false">
          <button class="btn-analisi" :disabled="analisiLoading || pulisciLoading" @click="avviaAnalisi('tutto')">
            {{ analisiLoading ? "⏳ Analisi..." : "🧠 Analizza" }}
          </button>
          <button class="btn-analisi-arrow" :disabled="analisiLoading || pulisciLoading" @click.stop="analisiMenuOpen = !analisiMenuOpen">▾</button>
          <div v-if="analisiMenuOpen" class="analisi-dropdown">
            <button @click="avviaAnalisi('eventi')">📅 Solo eventi e task</button>
            <button @click="avviaAnalisi('riassunto')">📊 Solo riassunto</button>
            <button @click="avviaAnalisi('suggerimenti')">💡 Solo suggerimenti</button>
            <button @click="avviaAnalisi('connessioni')">🔗 Solo connessioni</button>
          </div>
        </div>

        <button class="btn-refresh" @click="carica">↻</button>
      </div>
    </header>

    <!-- TAB BAR -->
    <nav class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'note' }]" @click="activeTab = 'note'">📋 Note</button>
      <button :class="['tab-btn', { active: activeTab === 'stats' }]" @click="activeTab = 'stats'">📊 Stats</button>
      <button :class="['tab-btn', { active: activeTab === 'archivio' }]" @click="activeTab = 'archivio'; caricaArchivio()">📁 Archivio</button>
      <button :class="['tab-btn', { active: activeTab === 'chat' }]" @click="activeTab = 'chat'">💬 Chat</button>
    </nav>

    <!-- PANNELLO ANALISI AI -->
    <transition name="slide">
      <div v-if="analisi" class="analisi-panel">
        <div class="analisi-header">
          <span>🤖 Analisi Gemma — {{ formatDate(analisi.generatoIl) }}</span>
          <button class="close-btn" @click="analisi = null">✕</button>
        </div>
        <div class="analisi-cards">

          <!-- EVENTI -->
          <div v-if="analisi.eventi" class="acard">
            <h3>📅 Eventos & Task</h3>
            <div v-if="!analisi.eventi?.eventi?.length" class="acard-empty">Nessun evento rilevato</div>
            <div v-else class="eventi-list">
              <div v-for="ev in analisi.eventi.eventi" :key="ev.titolo" class="evento">
                <div class="evento-header">
                  <span class="evento-titolo">{{ ev.titolo }}</span>
                  <span class="badge-prio" :class="ev.priorita">{{ ev.priorita }}</span>
                </div>
                <div v-if="ev.data" class="evento-meta">📆 {{ ev.data }}</div>
                <div v-if="ev.contesto" class="evento-meta">{{ ev.contesto }}</div>
              </div>
            </div>
          </div>

          <!-- RIASSUNTO -->
          <div v-if="analisi.riassunto" class="acard">
            <h3>📊 Riassunto</h3>
            <div class="riassunto">
              <div class="riassunto-row"><strong>Contesto:</strong> {{ analisi.riassunto?.contesto }}</div>
              <div class="riassunto-row"><strong>Tono:</strong> {{ analisi.riassunto?.tono }}</div>
              <div class="riassunto-row">
                <strong>Argomenti:</strong>
                <div class="tags">
                  <span v-for="a in analisi.riassunto?.argomenti" :key="a" class="tag">{{ a }}</span>
                </div>
              </div>
              <div class="riassunto-row sintesi">{{ analisi.riassunto?.sintesi }}</div>
            </div>
          </div>

          <!-- SUGGERIMENTI -->
          <div v-if="analisi.suggerimenti" class="acard">
            <h3>💡 Suggerimenti</h3>
            <div v-if="!analisi.suggerimenti?.suggerimenti?.length" class="acard-empty">Nessun suggerimento</div>
            <div v-else class="suggerimenti-list">
              <div v-for="s in analisi.suggerimenti.suggerimenti" :key="s.titolo" class="suggerimento">
                <div class="sug-header">
                  <span class="sug-titolo">{{ s.titolo }}</span>
                  <span class="badge-prio" :class="s.priorita">{{ s.priorita }}</span>
                </div>
                <div class="sug-desc">{{ s.descrizione }}</div>
              </div>
            </div>
          </div>

          <!-- CONNESSIONI -->
          <div v-if="analisi.connessioni" class="acard acard-full">
            <h3>🔗 Connessioni tematiche</h3>
            <div v-if="!analisi.connessioni?.connessioni?.length" class="acard-empty">Nessuna connessione significativa rilevata</div>
            <div v-else class="connessioni-list">
              <div v-for="c in analisi.connessioni.connessioni" :key="c.tema" class="connessione">
                <div class="conn-tema">{{ c.tema }}</div>
                <div class="conn-desc">{{ c.descrizione }}</div>
                <div v-if="c.note?.length" class="conn-note">{{ c.note.join(" · ") }}</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </transition>

    <!-- LOG PANEL -->
    <div v-if="isAnyLoading || activeLogs.length || activeStreaming" ref="logPanel" class="log-panel">
      <div v-if="isAnyLoading && !activeLogs.length && !activeStreaming" class="log-waiting">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="log-waiting-text">Gemma sta elaborando...</span>
      </div>
      <div class="log-line" v-for="(line, i) in activeLogs" :key="i">
        <span v-if="line.startsWith('[')" class="log-meta">{{ line.match(/^\[.*?\]/)?.[0] }}</span>
        <span class="log-msg">▶ {{ line.startsWith('[') ? line.replace(/^\[.*?\]\s*/, '') : line }}</span>
      </div>
      <div v-if="activeStreaming" class="log-streaming">
        <span class="log-streaming-label">💭</span>
        <span class="log-streaming-text">{{ activeStreaming }}<span class="log-cursor">▋</span></span>
      </div>
    </div>

    <div v-if="analisiError" class="error-bar">⚠️ {{ analisiError }}</div>

    <!-- LISTA NOTE -->
    <main v-if="activeTab === 'note'" class="bo-main">
      <div v-if="loading" class="empty">Caricamento...</div>
      <div v-else-if="filtered.length === 0" class="empty">Nessuna nota trovata.</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th style="width:150px">Data</th>
            <th style="width:180px">Audio</th>
            <th style="width:110px">Stato</th>
            <th>Trascrizione</th>
            <th style="width:40px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="nota in filtered" :key="nota.id" :class="{ pending: nota.status === 'in_elaborazione' }">
            <td class="cell-date">{{ formatDate(nota.createdAt) }}</td>
            <td class="cell-audio">
              <audio v-if="nota.filename" :src="`/audio/${nota.filename}`" controls />
              <span v-else class="muted">—</span>
            </td>
            <td class="cell-status">
              <span class="badge" :class="nota.status">
                {{ nota.status === "completata" ? "✓ Fatto" : "⏳ In corso" }}
              </span>
              <span v-if="nota.sentiment?.emoji" class="sent-emoji" :title="nota.sentiment?.tono">{{ nota.sentiment.emoji }}</span>
            </td>
            <td class="cell-text">
              <template v-if="editingId === nota.id">
                <textarea
                  v-model="editingTesto"
                  class="edit-textarea"
                  @keydown.escape="annullaEdit"
                  rows="3"
                  autofocus
                />
                <div class="edit-actions">
                  <button class="btn-save" @click="salvaEdit(nota)">✓ Salva</button>
                  <button class="btn-cancel" @click="annullaEdit">Annulla</button>
                </div>
              </template>
              <template v-else>
                <div class="text-row">
                  <span>
                    <span v-if="nota.testo_pulito" class="label-pulito">✨</span>
                    {{ nota.testo_pulito || nota.testo || '' }}
                    <span v-if="!nota.testo" class="muted">In trascrizione...</span>
                  </span>
                  <button v-if="nota.testo" class="btn-edit" @click="avviaEdit(nota)">✏️</button>
                </div>
              </template>
            </td>
            <td class="cell-delete">
              <button class="btn-delete" @click="elimina(nota.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </main>

    <!-- STATS -->
    <main v-else-if="activeTab === 'stats'" class="stats-main">
      <div class="stats-grid">

        <!-- CARD CONTATORI -->
        <div class="stat-card">
          <div class="stat-num">{{ stats.totale }}</div>
          <div class="stat-label">Note totali</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats.settimana }}</div>
          <div class="stat-label">Questa settimana</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ stats.completate }}</div>
          <div class="stat-label">Trascritte</div>
        </div>
        <div class="stat-card" v-if="stats.hasSentiment">
          <div class="stat-num">{{ stats.sentimentTop.emoji }}</div>
          <div class="stat-label">Tono prevalente: {{ stats.sentimentTop.tono }}</div>
        </div>

        <!-- ORA DEL GIORNO -->
        <div class="stat-card stat-wide">
          <h3 class="stat-title">🕐 Orario di registrazione</h3>
          <div class="bar-chart">
            <div v-for="(count, h) in stats.perOra" :key="h" class="bar-col">
              <div class="bar-fill" :style="{ height: stats.maxOra ? (count / stats.maxOra * 60) + 'px' : '0' }" :title="`${h}:00 — ${count} note`"></div>
              <div class="bar-label">{{ h % 6 === 0 ? h + 'h' : '' }}</div>
            </div>
          </div>
        </div>

        <!-- GIORNO DELLA SETTIMANA -->
        <div class="stat-card stat-wide">
          <h3 class="stat-title">📅 Giorno della settimana</h3>
          <div class="hbar-chart">
            <div v-for="(item, i) in stats.perGiorno" :key="i" class="hbar-row">
              <div class="hbar-day">{{ item.label }}</div>
              <div class="hbar-track">
                <div class="hbar-fill" :style="{ width: stats.maxGiorno ? (item.count / stats.maxGiorno * 100) + '%' : '0' }"></div>
              </div>
              <div class="hbar-count">{{ item.count }}</div>
            </div>
          </div>
        </div>

        <!-- SENTIMENT BREAKDOWN -->
        <div v-if="stats.hasSentiment" class="stat-card stat-wide">
          <h3 class="stat-title">🎭 Distribuzione sentiment</h3>
          <div class="sentiment-list">
            <div v-for="s in stats.sentimentList" :key="s.tono" class="sentiment-row">
              <span class="sentiment-emoji">{{ s.emoji }}</span>
              <span class="sentiment-tono">{{ s.tono }}</span>
              <div class="hbar-track">
                <div class="hbar-fill sent-fill" :style="{ width: (s.count / stats.totale * 100) + '%' }"></div>
              </div>
              <span class="hbar-count">{{ s.count }}</span>
            </div>
          </div>
        </div>

      </div>
    </main>

    <!-- ARCHIVIO -->
    <main v-else-if="activeTab === 'archivio'" class="archivio-main">
      <div v-if="archivioLoading" class="empty">Caricamento...</div>
      <div v-else-if="archivio.length === 0" class="empty">Nessuna analisi salvata. Lancia "🧠 Analizza" per iniziare.</div>
      <div v-else class="archivio-list">
        <div v-for="entry in archivio" :key="entry.id" class="arch-row">
          <div class="arch-meta">
            <div class="arch-date">{{ formatDate(entry.generatoIl) }}</div>
            <div class="arch-tipi">
              <span v-for="t in (entry.tipi || [])" :key="t" class="arch-chip">{{ tipoLabel(t) }}</span>
            </div>
          </div>
          <div class="arch-preview">
            <span v-if="entry.riassunto?.sintesi" class="arch-sintesi">{{ entry.riassunto.sintesi }}</span>
            <span v-else-if="entry.eventi?.eventi?.length" class="arch-sintesi">{{ entry.eventi.eventi.length }} eventi rilevati</span>
            <span v-else-if="entry.suggerimenti?.suggerimenti?.length" class="arch-sintesi">{{ entry.suggerimenti.suggerimenti.length }} suggerimenti</span>
            <span v-else class="arch-sintesi muted">—</span>
          </div>
          <div class="arch-actions">
            <button class="btn-arch-view" @click="visualizzaArchivio(entry)">Visualizza</button>
            <button class="btn-arch-del" @click="eliminaArchivio(entry.id)">✕</button>
          </div>
        </div>
      </div>
    </main>

    <!-- CHAT -->
    <div v-else class="chat-wrap">
      <div class="chat-messages" ref="chatScrollEl">
        <div v-if="chatHistory.length === 0 && !chatLoading" class="chat-empty">
          <div class="chat-empty-icon">💬</div>
          <div>Fai una domanda sulle tue note vocali</div>
          <div class="chat-suggestions">
            <button class="chip" @click="inviaChip('Cosa ho detto oggi?')">Cosa ho detto oggi?</button>
            <button class="chip" @click="inviaChip('Riassumi le note')">Riassumi le note</button>
            <button class="chip" @click="inviaChip('Ci sono appuntamenti o task?')">Appuntamenti o task?</button>
          </div>
        </div>
        <template v-else>
          <div v-for="(msg, i) in chatMessages" :key="i" :class="['bubble-row', msg.role]">
            <div class="bubble">{{ msg.content }}</div>
          </div>
          <div v-if="chatLoading" class="bubble-row assistant">
            <div class="bubble typing"><span></span><span></span><span></span></div>
          </div>
        </template>
      </div>
      <div class="chat-input-row">
        <textarea
          v-model="chatInput"
          class="chat-input"
          placeholder="Chiedi qualcosa sulle tue note..."
          rows="1"
          :disabled="chatLoading"
          @keydown.enter.exact.prevent="invia"
        />
        <button class="chat-send" :disabled="chatLoading || !chatInput.trim()" @click="invia">
          ↑
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";

const notes = ref([]);
const loading = ref(true);
const search = ref("");
const editingId = ref(null);
const editingTesto = ref("");
const analisi = ref(null);
const activeTab = ref("note");
const analisiLoading = ref(false);
const analisiError = ref(null);
const analisiLogs = ref([]);
const logPanel = ref(null);
const pulisciLoading = ref(false);
const analisiMenuOpen = ref(false);
const archivio = ref([]);
const archivioLoading = ref(false);

// chat
const chatInput = ref("");
const chatLoading = ref(false);
const chatMessages = ref([]);
const chatHistory = ref([]);
const chatLogs = ref([]);
const chatScrollEl = ref(null);
const analisiStreaming = ref("");
const chatStreaming = ref("");

// click-outside directive
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => { if (!el.contains(e.target)) binding.value(e); };
    document.addEventListener("click", el._clickOutside);
  },
  unmounted(el) { document.removeEventListener("click", el._clickOutside); },
};

const activeLogs = computed(() => {
  if (chatLoading.value && chatLogs.value.length) return chatLogs.value;
  if (analisiLoading.value && analisiLogs.value.length) return analisiLogs.value;
  return [];
});

const activeStreaming = computed(() => {
  if (chatLoading.value) return chatStreaming.value;
  if (analisiLoading.value || pulisciLoading.value) return analisiStreaming.value;
  return "";
});

const isAnyLoading = computed(() => analisiLoading.value || pulisciLoading.value || chatLoading.value);

const stats = computed(() => {
  const totale = notes.value.length;
  const completate = notes.value.filter((n) => n.status === "completata").length;
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const settimana = notes.value.filter((n) => new Date(n.createdAt).getTime() > cutoff).length;

  const perOra = Array(24).fill(0);
  notes.value.forEach((n) => { perOra[new Date(n.createdAt).getHours()]++; });
  const maxOra = Math.max(...perOra, 1);

  const giorni = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const conteggioGiorni = Array(7).fill(0);
  notes.value.forEach((n) => { conteggioGiorni[new Date(n.createdAt).getDay()]++; });
  const perGiorno = giorni.map((label, i) => ({ label, count: conteggioGiorni[i] }));
  const maxGiorno = Math.max(...conteggioGiorni, 1);

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

  return { totale, completate, settimana, perOra, maxOra, perGiorno, maxGiorno, sentimentList, hasSentiment, sentimentTop };
});

watch(activeLogs, () => {
  nextTick(() => { if (logPanel.value) logPanel.value.scrollTop = logPanel.value.scrollHeight; });
}, { deep: true });

watch(chatMessages, () => {
  nextTick(() => { if (chatScrollEl.value) chatScrollEl.value.scrollTop = chatScrollEl.value.scrollHeight; });
}, { deep: true });

let pollInterval = null;

const filtered = computed(() => {
  const q = search.value.toLowerCase();
  return q ? notes.value.filter((n) =>
    (n.testo_pulito || n.testo || "").toLowerCase().includes(q)
  ) : notes.value;
});

async function carica(mostraLoading = true) {
  if (mostraLoading) loading.value = true;
  try {
    const res = await fetch("/api/notes");
    notes.value = await res.json();
  } finally {
    if (mostraLoading) loading.value = false;
  }
  const hasPending = notes.value.some((n) => n.status === "in_elaborazione");
  if (!hasPending && pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  else if (hasPending && !pollInterval) { pollInterval = setInterval(() => carica(false), 4000); }
}

async function pollJob(jobId, onDone, onError, onLogs, onStream) {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${jobId}`);
        const job = await res.json();
        if (onLogs && job.logs) onLogs(job.logs);
        if (onStream && job.streaming !== undefined) onStream(job.streaming);
        if (job.status === "completato") {
          clearInterval(interval);
          onDone(job.risultato);
          resolve();
        } else if (job.status === "errore") {
          clearInterval(interval);
          onError(job.errore);
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

async function avviaPulizia() {
  pulisciLoading.value = true;
  analisiError.value = null;
  analisiStreaming.value = "";
  try {
    const res = await fetch("/api/pulisci", { method: "POST" });
    const { jobId } = await res.json();
    await pollJob(
      jobId,
      async () => { analisiStreaming.value = ""; await carica(); },
      (err) => { analisiError.value = err; },
      (logs) => { analisiLogs.value = logs; },
      (text) => { analisiStreaming.value = text; }
    );
  } catch (err) {
    analisiError.value = err.message;
  } finally {
    pulisciLoading.value = false;
    analisiStreaming.value = "";
  }
}

async function avviaAnalisi(tipo = "tutto") {
  analisiMenuOpen.value = false;
  analisiLoading.value = true;
  analisiError.value = null;
  analisi.value = null;
  analisiLogs.value = [];
  analisiStreaming.value = "";
  try {
    const res = await fetch("/api/analisi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo }),
    });
    const { jobId } = await res.json();
    await pollJob(
      jobId,
      (risultato) => { analisiStreaming.value = ""; analisi.value = risultato; },
      (err) => { analisiError.value = err; },
      (logs) => { analisiLogs.value = logs; },
      (text) => { analisiStreaming.value = text; }
    );
  } catch (err) {
    analisiError.value = err.message;
  } finally {
    analisiLoading.value = false;
    analisiStreaming.value = "";
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function avviaEdit(nota) {
  editingId.value = nota.id;
  editingTesto.value = nota.testo_pulito || nota.testo || "";
}

function annullaEdit() {
  editingId.value = null;
  editingTesto.value = "";
}

async function salvaEdit(nota) {
  const campo = nota.testo_pulito !== undefined ? "testo_pulito" : "testo";
  await fetch(`/api/notes/${nota.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [campo]: editingTesto.value }),
  });
  const idx = notes.value.findIndex((n) => n.id === nota.id);
  if (idx !== -1) notes.value[idx] = { ...notes.value[idx], [campo]: editingTesto.value };
  annullaEdit();
}

async function elimina(id) {
  await fetch(`/api/notes/${id}`, { method: "DELETE" });
  notes.value = notes.value.filter((n) => n.id !== id);
}

async function invia() {
  const domanda = chatInput.value.trim();
  if (!domanda || chatLoading.value) return;
  chatInput.value = "";
  chatMessages.value.push({ role: "user", content: domanda });
  chatLoading.value = true;
  chatLogs.value = [];
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domanda, history: chatHistory.value }),
    });
    const { jobId } = await res.json();
    await pollJob(
      jobId,
      (risultato) => {
        chatStreaming.value = "";
        const risposta = risultato.risposta || "Nessuna risposta.";
        chatMessages.value.push({ role: "assistant", content: risposta });
        chatHistory.value.push({ user: domanda, assistant: risposta });
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

const TIPO_LABEL = { eventi: "📅 Eventi", riassunto: "📊 Riassunto", suggerimenti: "💡 Suggerimenti", connessioni: "🔗 Connessioni" };
function tipoLabel(t) { return TIPO_LABEL[t] || t; }

async function caricaArchivio() {
  archivioLoading.value = true;
  try {
    const res = await fetch("/api/archivio");
    archivio.value = await res.json();
  } finally {
    archivioLoading.value = false;
  }
}

function visualizzaArchivio(entry) {
  analisi.value = entry;
  activeTab.value = "note";
}

async function eliminaArchivio(id) {
  await fetch(`/api/archivio/${id}`, { method: "DELETE" });
  archivio.value = archivio.value.filter((e) => e.id !== id);
}

function inviaChip(testo) {
  chatInput.value = testo;
  invia();
}

onMounted(() => carica());
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

/* SPLIT BUTTON ANALISI */
.analisi-split { position: relative; display: flex; }
.btn-analisi { padding: 8px 14px; background: #5856d6; color: #fff; border: none; border-radius: 10px 0 0 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn-analisi:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-analisi-arrow { padding: 8px 10px; background: #4a48c0; color: #fff; border: none; border-left: 1px solid #6e6cd4; border-radius: 0 10px 10px 0; font-size: 12px; cursor: pointer; }
.btn-analisi-arrow:disabled { opacity: 0.6; cursor: not-allowed; }
.analisi-dropdown { position: absolute; top: calc(100% + 6px); right: 0; background: #fff; border: 1px solid #e5e5ea; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); min-width: 200px; z-index: 100; overflow: hidden; }
.analisi-dropdown button { display: block; width: 100%; padding: 11px 16px; text-align: left; background: none; border: none; font-size: 14px; color: #1d1d1f; cursor: pointer; }
.analisi-dropdown button:hover { background: #f5f5f7; }
.analisi-dropdown button + button { border-top: 1px solid #f2f2f7; }

.btn-refresh { padding: 8px 12px; border: 1px solid #e5e5ea; border-radius: 10px; background: #fff; font-size: 16px; cursor: pointer; }

/* TAB BAR */
.tab-bar { display: flex; gap: 4px; padding: 8px 24px 0; background: #fff; border-bottom: 1px solid #e5e5ea; }
.tab-btn { padding: 8px 18px; border: none; background: none; font-size: 14px; font-weight: 500; color: #8e8e93; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab-btn.active { color: #007aff; border-bottom-color: #007aff; font-weight: 600; }
.tab-btn:hover:not(.active) { color: #3c3c43; }

/* PANNELLO ANALISI */
.analisi-panel { background: #fff; border-bottom: 1px solid #e5e5ea; padding: 20px 24px; }
.analisi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 13px; color: #8e8e93; font-weight: 500; }
.close-btn { background: none; border: none; font-size: 18px; color: #c7c7cc; cursor: pointer; }

.analisi-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

.acard { background: #f5f5f7; border-radius: 14px; padding: 16px; }
.acard-full { grid-column: 1 / -1; }
.acard h3 { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #1d1d1f; }
.acard-empty { color: #c7c7cc; font-size: 13px; font-style: italic; }

/* EVENTI */
.eventi-list { display: flex; flex-direction: column; gap: 10px; }
.evento { background: #fff; border-radius: 10px; padding: 10px 12px; }
.evento-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.evento-titolo { font-size: 13px; font-weight: 600; }
.evento-meta { font-size: 12px; color: #8e8e93; margin-top: 2px; }

/* RIASSUNTO */
.riassunto { display: flex; flex-direction: column; gap: 8px; }
.riassunto-row { font-size: 13px; line-height: 1.5; }
.riassunto-row strong { color: #8e8e93; font-weight: 600; margin-right: 4px; }
.sintesi { color: #3c3c43; font-style: italic; border-top: 1px solid #e5e5ea; padding-top: 8px; margin-top: 4px; }

.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.tag { background: #e5e5ea; border-radius: 20px; padding: 2px 10px; font-size: 12px; }

/* SUGGERIMENTI */
.suggerimenti-list { display: flex; flex-direction: column; gap: 10px; }
.suggerimento { background: #fff; border-radius: 10px; padding: 10px 12px; }
.sug-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.sug-titolo { font-size: 13px; font-weight: 600; }
.sug-desc { font-size: 12px; color: #3c3c43; line-height: 1.4; }

/* CONNESSIONI */
.connessioni-list { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; }
.connessione { background: #fff; border-radius: 10px; padding: 10px 14px; flex: 1; min-width: 200px; border-left: 3px solid #5856d6; }
.conn-tema { font-size: 13px; font-weight: 700; color: #5856d6; margin-bottom: 4px; }
.conn-desc { font-size: 12px; color: #3c3c43; line-height: 1.4; margin-bottom: 4px; }
.conn-note { font-size: 11px; color: #8e8e93; }

/* BADGE PRIORITÀ */
.badge-prio { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; }
.badge-prio.alta { background: #ffe5e5; color: #ff3b30; }
.badge-prio.media { background: #fff4e5; color: #ff9500; }
.badge-prio.bassa { background: #e8f8ec; color: #34c759; }

/* LOG PANEL */
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

/* TABELLA */
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

/* STATS */
.stats-main { flex: 1; overflow: auto; padding: 24px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.stat-wide { grid-column: span 2; }
.stat-num { font-size: 36px; font-weight: 700; color: #1d1d1f; line-height: 1; margin-bottom: 6px; }
.stat-label { font-size: 13px; color: #8e8e93; }
.stat-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; color: #1d1d1f; }

/* BAR CHART ORARIO */
.bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 70px; }
.bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; gap: 3px; }
.bar-fill { background: #5856d6; border-radius: 3px 3px 0 0; width: 100%; min-height: 2px; transition: height 0.3s; }
.bar-label { font-size: 9px; color: #8e8e93; }

/* HBAR CHART GIORNI */
.hbar-chart { display: flex; flex-direction: column; gap: 8px; }
.hbar-row { display: flex; align-items: center; gap: 10px; }
.hbar-day { font-size: 12px; color: #8e8e93; width: 28px; flex-shrink: 0; }
.hbar-track { flex: 1; background: #f2f2f7; border-radius: 4px; height: 10px; overflow: hidden; }
.hbar-fill { background: #007aff; height: 100%; border-radius: 4px; transition: width 0.3s; }
.sent-fill { background: #5856d6; }
.hbar-count { font-size: 12px; color: #8e8e93; width: 20px; text-align: right; }

/* SENTIMENT */
.sentiment-list { display: flex; flex-direction: column; gap: 10px; }
.sentiment-row { display: flex; align-items: center; gap: 10px; }
.sentiment-emoji { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.sentiment-tono { font-size: 13px; color: #3c3c43; width: 90px; flex-shrink: 0; text-transform: capitalize; }

/* ARCHIVIO */
.archivio-main { flex: 1; overflow: auto; padding: 20px 24px; }
.archivio-list { display: flex; flex-direction: column; gap: 10px; }
.arch-row { background: #fff; border-radius: 14px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.arch-meta { flex-shrink: 0; width: 200px; }
.arch-date { font-size: 13px; font-weight: 600; color: #1d1d1f; margin-bottom: 6px; }
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

/* CHAT */
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
.bubble { max-width: 70%; padding: 12px 16px; border-radius: 18px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
.bubble-row.user .bubble { background: #007aff; color: #fff; border-bottom-right-radius: 4px; }
.bubble-row.assistant .bubble { background: #fff; color: #1d1d1f; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
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

/* INLINE EDIT */
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
</style>
