<template>
  <div class="record-view">
    <div class="record-logo-header">
      <img src="/kubi_logo.png" alt="KuBi" class="record-logo" />
    </div>

    <div class="preview-card wake-card">
      <div class="wake-row">
        <button
          type="button"
          class="wake-toggle"
          :class="{ active: wakeWordEnabled }"
          :aria-pressed="wakeWordEnabled"
          :disabled="!wakeWordSupported"
          @click="toggleWakeWord"
        >
          <span class="toggle-track">
            <span class="toggle-thumb" />
          </span>
          <span class="toggle-label">{{ wakeWordLabel }}</span>
        </button>

        <transition name="fade">
          <div v-if="wakeWordEnabled && wakeWordListening" class="wake-indicator">
            <span class="pulse-dot" />
            <span>In ascolto</span>
          </div>
        </transition>
      </div>

      <p class="wake-help">
        <span v-if="!wakeWordSupported">Questo browser non supporta la wake word.</span>
        <span v-else-if="wakeWordError">{{ wakeWordError }}</span>
        <span v-else-if="wakeWordEnabled">Pronuncia la wake word per avviare la registrazione.</span>
        <span v-else>Attiva il toggle per avviare la registrazione con la wake word.</span>
      </p>
    </div>

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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useApi } from "../composables/useApi.js";
import { useWakeWord } from "../composables/useWakeWord.js";

const { apiFetch } = useApi();

const emit = defineEmits(["uploaded"]);
const VOICE_COMMAND_CHUNK_MS = 1600;

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
let commandStream = null;
let commandLoopActive = false;
let commandBusy = false;
let audioCtx = null;
let promptBuffer = null;

async function unlockAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  try {
    const res = await fetch("/sounds/ok_rec.mp3");
    const arrayBuffer = await res.arrayBuffer();
    promptBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {}
}

async function playPrompt() {
  if (!audioCtx || !promptBuffer) {
    console.warn("[prompt] audioCtx or buffer not ready");
    return;
  }
  if (audioCtx.state === "suspended") await audioCtx.resume();
  console.info("[prompt] playing, ctx state:", audioCtx.state);
  await new Promise((resolve) => {
    const source = audioCtx.createBufferSource();
    source.buffer = promptBuffer;
    source.connect(audioCtx.destination);
    source.onended = resolve;
    source.start();
  });
}

const wakeWord = useWakeWord({
  onTriggered: async () => {
    if (recording.value || blob.value) return;
    await playPrompt();
    await start();
  },
});
const wakeWordEnabled = computed(() => wakeWord.enabled.value);
const wakeWordSupported = computed(() => wakeWord.supported);
const wakeWordListening = computed(() => wakeWord.listening.value);
const wakeWordLabel = computed(() => wakeWord.label.value);
const wakeWordError = computed(() => wakeWord.error.value);
const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const canListenForWakeWord = computed(() => wakeWordEnabled.value && !recording.value && !blob.value);
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

function toggleWakeWord() {
  if (!wakeWordSupported.value) return;
  wakeWord.enabled.value = !wakeWord.enabled.value;
  if (wakeWord.enabled.value) unlockAudio();
  console.info("[wake] ui toggle click", { enabled: wakeWord.enabled.value });
}

function getMimeType() {
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function captureChunk(stream, durationMs) {
  return new Promise((resolve, reject) => {
    const mimeType = getMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const localChunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) localChunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error("Registrazione comando fallita"));
    recorder.onstop = () => resolve(new Blob(localChunks, { type: recorder.mimeType || "audio/webm" }));
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
  });
}

function getAudioExtension(blobType) {
  if (blobType.includes("mp4")) return "mp4";
  if (blobType.includes("ogg")) return "ogg";
  return "webm";
}

async function detectVoiceCommand(blob) {
  const form = new FormData();
  form.append("audio", blob, `command-${Date.now()}.${getAudioExtension(blob.type)}`);
  const response = await apiFetch("/api/voice-command", { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Voice command non disponibile");
  return data;
}

async function start() {
  chunks = [];
  resetPreview();
  seconds.value = 0;
  wakeWord.stopLoop();

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getMimeType();
  mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.onstop = () => {
    const type = mediaRecorder.mimeType || mimeType || "audio/mp4";
    blob.value = new Blob(chunks, { type });
    revokeAudioUrl();
    audioUrl.value = URL.createObjectURL(blob.value);
    stopVoiceCommandLoop();
    stopMediaStream();
  };
  mediaRecorder.start();
  recording.value = true;
  timer = setInterval(() => seconds.value++, 1000);
  startVoiceCommandLoop();
}

function stop() {
  mediaRecorder?.stop();
  recording.value = false;
  clearInterval(timer);
  timer = null;
}

async function startVoiceCommandLoop() {
  if (!mediaStream || commandLoopActive) return;
  commandStream = mediaStream.clone();
  commandLoopActive = true;
  console.info("[voice-command] loop started");

  while (commandLoopActive && recording.value) {
    try {
      const blob = await captureChunk(commandStream, VOICE_COMMAND_CHUNK_MS);
      if (!commandLoopActive || !recording.value || commandBusy) continue;

      commandBusy = true;
      const result = await detectVoiceCommand(blob);
      console.info("[voice-command] result", result);
      if (result.stopDetected && recording.value) {
        mostraMessaggio(`Comando vocale rilevato: ${result.matchedCommand}`, "success");
        stop();
        break;
      }
    } catch (err) {
      console.info("[voice-command] error", err?.message || err);
    } finally {
      commandBusy = false;
    }
  }

  stopVoiceCommandLoop();
}

function stopVoiceCommandLoop() {
  commandLoopActive = false;
  commandStream?.getTracks().forEach((track) => track.stop());
  commandStream = null;
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

watch(canListenForWakeWord, (value) => {
  if (!wakeWord.enabled.value) return;
  if (value) wakeWord.startLoop();
  else wakeWord.stopLoop();
}, { immediate: true });

watch(() => wakeWord.enabled.value, (value) => {
  console.info("[wake] record-view enabled changed", { enabled: value });
}, { immediate: true });

onMounted(() => {
  wakeWord.refreshAvailability();
  apiFetch("/api/config").catch(() => {});
});

onUnmounted(() => {
  clearInterval(timer);
  clearTimeout(messageTimeout);
  revokeAudioUrl();
  stopVoiceCommandLoop();
  stopMediaStream();
  wakeWord.stopLoop();
});
</script>

<style scoped>
.record-view {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.record-logo-header {
  display: flex;
  justify-content: center;
  padding: 8px 0 4px;
}

.record-logo {
  height: 120px;
  width: auto;
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

.wake-card {
  gap: 10px;
}

.wake-help {
  font-size: 13px;
  color: #6e6e73;
  line-height: 1.4;
  text-align: center;
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
  border: none;
  background: transparent;
  padding: 0;
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

.wake-toggle.active .toggle-track {
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

.wake-toggle.active .toggle-thumb {
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
