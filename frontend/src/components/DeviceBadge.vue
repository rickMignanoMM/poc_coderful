<template>
  <teleport to="body">
    <div v-if="deviceName" class="device-badge" :class="deviceClass" @click="modalOpen = true" title="Clicca per i dettagli">
      <span class="device-dot"></span>
      <div class="device-info">
        <span class="device-name">{{ deviceName }}</span>
        <span v-if="deviceSubtitle" class="device-subtitle">{{ deviceSubtitle }}</span>
      </div>
    </div>

    <div v-if="modalOpen" class="modal-overlay" @click.self="modalOpen = false">
      <div class="modal-box device-modal-box">
        <div class="device-modal-header" :class="deviceClass">
          <span class="device-dot device-dot-lg"></span>
          <div>
            <div class="device-modal-title">{{ deviceName }}</div>
            <div class="device-modal-sub">{{ deviceSubtitle }}</div>
          </div>
          <button class="device-modal-close" @click="modalOpen = false">✕</button>
        </div>

        <div class="device-modal-body">
          <div v-if="deviceSpecs">
            <div v-for="(section, sectionKey) in deviceSpecs" :key="sectionKey" class="device-spec-section">
              <div class="device-spec-section-title">{{ sectionKey }}</div>
              <div class="device-spec-grid">
                <template v-for="(val, key) in section" :key="key">
                  <span class="spec-key">{{ key }}</span>
                  <span class="spec-val">{{ val }}</span>
                </template>
              </div>
            </div>
          </div>
          <div v-else class="device-modal-empty">Nessuna specifica configurata.</div>

          <!-- Backend switcher -->
          <div class="backend-section">
            <div class="device-spec-section-title">Backend</div>
            <div class="backend-list">
              <button
                v-for="b in backendOptions"
                :key="b.url"
                class="backend-btn"
                :class="{ active: b.url === activeUrl }"
                @click="switchBackend(b.url)"
              >
                <span class="backend-dot" :class="b.url === activeUrl ? deviceClass : 'device-default'"></span>
                <span class="backend-btn-name">{{ b.name }}</span>
                <span v-if="b.url === activeUrl" class="backend-active-label">attivo</span>
              </button>
            </div>
            <div v-if="switching" class="backend-switching">Connessione in corso...</div>
            <div v-if="switchError" class="backend-error">{{ switchError }}</div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useApi } from "../composables/useApi.js";

const { baseUrl, setBackend, apiFetch } = useApi();

const deviceName = ref("");
const deviceSubtitle = ref("");
const deviceSpecs = ref(null);
const peers = ref([]);
const modalOpen = ref(false);
const switching = ref(false);
const switchError = ref("");

const activeUrl = computed(() => baseUrl.value);

const deviceClass = computed(() => {
  const name = deviceName.value.toLowerCase();
  if (name.includes("jetson")) return "device-jetson";
  if (name.includes("tuxedo") || name.includes("intel")) return "device-tuxedo";
  return "device-default";
});

const backendOptions = computed(() => {
  const current = { name: deviceName.value || "Locale", url: baseUrl.value };
  const otherPeers = (peers.value || []).filter((p) => p.url !== baseUrl.value);
  return [current, ...otherPeers];
});

async function fetchConfig() {
  const res = await apiFetch("/api/config");
  const config = await res.json();
  deviceName.value = config.deviceName || "";
  deviceSubtitle.value = config.deviceSubtitle || "";
  deviceSpecs.value = config.deviceSpecs || null;
  peers.value = config.peers || [];
}

async function switchBackend(url) {
  if (url === activeUrl.value) return;
  switching.value = true;
  switchError.value = "";
  setBackend(url);
  try {
    await fetchConfig();
  } catch {
    switchError.value = "Backend non raggiungibile.";
  } finally {
    switching.value = false;
  }
}

onMounted(async () => {
  try { await fetchConfig(); } catch {}
});
</script>

<style scoped>
.device-badge { position: fixed; bottom: 20px; left: 20px; display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 14px; backdrop-filter: blur(12px); z-index: 9000; box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.2); cursor: pointer; }
.device-tuxedo { background: rgba(88, 86, 214, 0.92); color: #fff; }
.device-jetson  { background: rgba(52, 199, 89, 0.92); color: #fff; }
.device-default { background: rgba(30, 30, 30, 0.88); color: #fff; }
.device-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.9); animation: pulse-dot 2s infinite; flex-shrink: 0; }
.device-dot-lg { width: 12px; height: 12px; flex-shrink: 0; }
@keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
.device-info { display: flex; flex-direction: column; gap: 1px; }
.device-name { font-size: 13px; font-weight: 700; line-height: 1.2; }
.device-subtitle { font-size: 10px; opacity: 0.8; line-height: 1.2; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-box { background: #fff; border-radius: 16px; width: 90%; max-width: 480px; box-shadow: 0 12px 40px rgba(0,0,0,0.18); overflow: hidden; }
.device-modal-box { padding: 0; }
.device-modal-header { display: flex; align-items: center; gap: 14px; padding: 20px 24px; color: #fff; position: relative; }
.device-modal-title { font-size: 18px; font-weight: 700; line-height: 1.2; }
.device-modal-sub { font-size: 12px; opacity: 0.8; margin-top: 2px; }
.device-modal-close { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.2); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.device-modal-close:hover { background: rgba(255,255,255,0.35); }
.device-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
.device-modal-empty { color: #8e8e93; font-size: 14px; }
.device-spec-section-title { font-size: 11px; font-weight: 700; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }
.device-spec-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; }
.spec-key { font-size: 13px; color: #8e8e93; white-space: nowrap; }
.spec-val { font-size: 13px; color: #1d1d1f; font-weight: 600; }

.backend-section { border-top: 1px solid #f2f2f7; padding-top: 16px; }
.backend-list { display: flex; flex-direction: column; gap: 8px; }
.backend-btn { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; border: 1.5px solid #e5e5ea; background: #fff; cursor: pointer; text-align: left; transition: all 0.15s; }
.backend-btn:hover { border-color: #c7c7cc; background: #f9f9fb; }
.backend-btn.active { border-color: #5856d6; background: #f0f0ff; }
.backend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.backend-dot.device-tuxedo { background: rgba(88, 86, 214, 0.92); }
.backend-dot.device-jetson  { background: rgba(52, 199, 89, 0.92); }
.backend-dot.device-default { background: rgba(30, 30, 30, 0.5); }
.backend-btn-name { flex: 1; font-size: 14px; font-weight: 500; color: #1d1d1f; }
.backend-active-label { font-size: 11px; font-weight: 600; color: #5856d6; background: #e8e8ff; padding: 2px 8px; border-radius: 20px; }
.backend-switching { font-size: 13px; color: #8e8e93; text-align: center; padding: 4px 0; }
.backend-error { font-size: 13px; color: #ff3b30; text-align: center; padding: 4px 0; }
</style>
