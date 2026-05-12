<template>
  <div class="record-view">
    <div class="record-card">
      <div class="timer">{{ formatTime(seconds) }}</div>

      <div class="waveform" :class="{ active: recording }">
        <span v-for="i in 12" :key="i" class="bar" :style="{ animationDelay: `${i * 0.08}s` }" />
      </div>

      <button class="record-btn" :class="{ recording }" @click="toggle">
        <span v-if="!recording">●</span>
        <span v-else><Icon icon="lucide:square" :width="28" :height="28" style="vertical-align: middle" /></span>
      </button>
      <p class="hint">{{ recording ? "Tocca per fermare" : "Tocca per registrare" }}</p>

      <div class="wake-row">
        <label class="wake-toggle">
          <input type="checkbox" v-model="wakeWord.enabled.value" />
          <span class="toggle-track"><span class="toggle-thumb" /></span>
          <span class="toggle-label">Wake word</span>
        </label>
        <transition name="fade">
          <span v-if="wakeWord.listening.value" class="wake-indicator">
            <span class="pulse-dot" />
            Ascolto "KUBI REGISTRA"
          </span>
        </transition>
      </div>
    </div>

    <div v-if="blob" class="preview-card">
      <audio :src="audioUrl" controls />
      <div class="actions">
        <button class="btn-secondary" @click="scarta">Scarta</button>
        <button class="btn-primary" :disabled="uploading" @click="invia">
          {{ uploading ? "Invio..." : "Invia" }}
        </button>
      </div>
    </div>

    <div v-if="message" class="toast" :class="message.type">{{ message.text }}</div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { useApi } from "../composables/useApi.js";
import { useWakeWord } from "../composables/useWakeWord.js";

const { apiFetch } = useApi();

const emit = defineEmits(["uploaded"]);

const recording = ref(false);
const blob = ref(null);
const audioUrl = ref(null);
const uploading = ref(false);
const seconds = ref(0);
const message = ref(null);

let mediaRecorder = null;
let chunks = [];
let timer = null;
let mediaStream = null;
let messageTimeout = null;

const wakeWord = useWakeWord({ onTriggered: () => start() });

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const audioExtension = computed(() => {
  if (!blob.value) return "webm";
  if (blob.value.type.includes("mp4")) return "mp4";
  if (blob.value.type.includes("ogg")) return "ogg";
  return "webm";
});

async function toggle() {
  if (recording.value) {
    stop();
  } else {
    await start();
  }
}

function getMimeType() {
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

async function start() {
  // Stop wake word listener before opening mic for recording
  wakeWord.stopLoop();
  await new Promise((r) => setTimeout(r, 100));

  chunks = [];
  resetPreview();
  seconds.value = 0;

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getMimeType();
  mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.onstop = () => {
    const type = mediaRecorder.mimeType || mimeType || "audio/mp4";
    blob.value = new Blob(chunks, { type });
    revokeAudioUrl();
    audioUrl.value = URL.createObjectURL(blob.value);
    stopMediaStream();
    // Restart wake word listener after recording ends
    if (wakeWord.enabled.value) {
      setTimeout(() => wakeWord.startLoop(), 500);
    }
  };
  mediaRecorder.start();
  recording.value = true;
  timer = setInterval(() => seconds.value++, 1000);
}

function stop() {
  mediaRecorder?.stop();
  recording.value = false;
  clearInterval(timer);
  timer = null;
}

function scarta() {
  resetPreview();
  seconds.value = 0;
}

async function invia() {
  if (!blob.value) return;
  uploading.value = true;
  const form = new FormData();
  form.append("audio", blob.value, `nota-${Date.now()}.${audioExtension.value}`);
  try {
    const res = await apiFetch("/api/audio", { method: "POST", body: form });
    if (!res.ok) throw new Error();
    mostraMessaggio("Nota inviata! Trascrizione in corso...", "success");
    scarta();
    setTimeout(() => emit("uploaded"), 1500);
  } catch {
    mostraMessaggio("Errore durante l'invio", "error");
  } finally {
    uploading.value = false;
  }
}

function mostraMessaggio(text, type) {
  clearTimeout(messageTimeout);
  message.value = { text, type };
  messageTimeout = setTimeout(() => (message.value = null), 3000);
}

function resetPreview() {
  blob.value = null;
  revokeAudioUrl();
}

function revokeAudioUrl() {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
    audioUrl.value = null;
  }
}

function stopMediaStream() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

onUnmounted(() => {
  clearInterval(timer);
  clearTimeout(messageTimeout);
  revokeAudioUrl();
  stopMediaStream();
});
</script>

<style scoped>
.record-view {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.record-card {
  background: #fff;
  border-radius: 20px;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.timer {
  font-size: 48px;
  font-weight: 200;
  letter-spacing: 4px;
  color: #1d1d1f;
  font-variant-numeric: tabular-nums;
}

.waveform {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
}

.bar {
  width: 4px;
  height: 8px;
  background: #c7c7cc;
  border-radius: 2px;
  transition: background 0.3s;
}

.waveform.active .bar {
  background: #007aff;
  animation: wave 0.8s ease-in-out infinite alternate;
}

@keyframes wave {
  from { height: 8px; }
  to { height: 32px; }
}

.record-btn {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: none;
  background: #007aff;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(0,122,255,0.4);
}

.record-btn.recording {
  background: #ff3b30;
  box-shadow: 0 4px 16px rgba(255,59,48,0.4);
}

.hint {
  color: #8e8e93;
  font-size: 14px;
}

.preview-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

audio { width: 100%; }

.actions {
  display: flex;
  gap: 12px;
}

.btn-primary, .btn-secondary {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary { background: #007aff; color: #fff; }
.btn-secondary { background: #f2f2f7; color: #1d1d1f; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.toast {
  padding: 14px 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  text-align: center;
}

.toast.success { background: #34c759; color: #fff; }
.toast.error { background: #ff3b30; color: #fff; }

/* Wake word */
.wake-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.wake-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.wake-toggle input {
  display: none;
}

.toggle-track {
  width: 40px;
  height: 24px;
  background: #c7c7cc;
  border-radius: 12px;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}

.wake-toggle input:checked + .toggle-track {
  background: #34c759;
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

.wake-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(16px);
}

.toggle-label {
  font-size: 14px;
  color: #3c3c43;
  font-weight: 500;
}

.wake-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #34c759;
  font-weight: 500;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: #34c759;
  border-radius: 50%;
  animation: pulse-ring 1.4s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes pulse-ring {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
