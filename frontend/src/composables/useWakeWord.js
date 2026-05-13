import { ref, watch, onUnmounted } from "vue";
import { apiFetch } from "./useApi.js";

const WAKE_COMMAND = "regist";
const CHUNK_MS = 1000;
const STORAGE_KEY = "wakeWordEnabled";

function getMimeType() {
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function getExt(mimeType) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function captureChunk(stream, durationMs) {
  return new Promise((resolve) => {
    const mimeType = getMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    recorder.start();
    setTimeout(() => recorder.stop(), durationMs);
  });
}

function beep() {
  try {
    const sampleRate = 8000;
    const duration = 0.25;
    const freq = 880;
    const numSamples = Math.floor(sampleRate * duration);
    const buf = new ArrayBuffer(44 + numSamples);
    const v = new DataView(buf);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + numSamples, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, "data"); v.setUint32(40, numSamples, true);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = 1 - t / duration;
      v.setUint8(44 + i, 128 + Math.round(100 * env * Math.sin(2 * Math.PI * freq * t)));
    }
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    const audio = new Audio(url);
    audio.play().catch(() => {});
    audio.onended = () => URL.revokeObjectURL(url);
  } catch {}
}

async function transcribeChunk(blob) {
  try {
    const ext = getExt(blob.type);
    const form = new FormData();
    form.append("audio", blob, `wake-${Date.now()}.${ext}`);
    const res = await apiFetch("/api/wake", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = await res.json();
    return data.transcript || null;
  } catch {
    return null;
  }
}


export function useWakeWord({ onTriggered } = {}) {
  const enabled = ref(localStorage.getItem(STORAGE_KEY) === "true");
  const listening = ref(false);
  const status = ref("idle"); // 'idle' | 'listening' | 'triggered'

  let loopActive = false;
  let currentStream = null;

  async function startLoop() {
    if (loopActive) return;
    loopActive = true;

    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      loopActive = false;
      return;
    }

    listening.value = true;
    status.value = "listening";

    while (loopActive) {
      const blob = await captureChunk(currentStream, CHUNK_MS);
      if (!loopActive) break;

      const transcript = await transcribeChunk(blob);
      if (!loopActive) break;

      console.log("[wake] transcript:", transcript);

      if (transcript?.toLowerCase().includes(WAKE_COMMAND)) {
        console.log("[wake] TRIGGERED");
        status.value = "triggered";
        stopStream();
        beep();
        onTriggered?.();
        // Loop stopped — onTriggered is expected to call stopLoop()
        // If for some reason it didn't, bail out anyway
        break;
      }
    }

    stopStream();
    listening.value = false;
    status.value = "idle";
    loopActive = false;
  }

  function stopStream() {
    currentStream?.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }

  function stopLoop() {
    loopActive = false;
    stopStream();
    listening.value = false;
    status.value = "idle";
  }

  watch(enabled, (val) => {
    localStorage.setItem(STORAGE_KEY, val);
    if (val) startLoop();
    else stopLoop();
  });

  if (enabled.value) startLoop();

  onUnmounted(() => stopLoop());

  return { enabled, listening, status, startLoop, stopLoop };
}
