<template>
  <div class="record-view">
    <div class="record-card">
      <div class="timer">{{ formatTime(seconds) }}</div>

      <div class="waveform" :class="{ active: recording }">
        <span v-for="i in 12" :key="i" class="bar" :style="{ animationDelay: `${i * 0.08}s` }" />
      </div>

      <button class="record-btn" :class="{ recording }" @click="toggle">
        <span v-if="!recording">●</span>
        <span v-else>■</span>
      </button>
      <p class="hint">{{ recording ? "Tocca per fermare" : "Tocca per registrare" }}</p>
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
import { useApi } from "../composables/useApi.js";

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
</style>
