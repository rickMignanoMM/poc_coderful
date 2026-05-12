import { ref, watch, onUnmounted } from "vue";
import { apiFetch } from "./useApi.js";

const WAKE_COMMAND = "kubi registra";
const CHUNK_MS = 2500;
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

function speak(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "it-IT";
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
    setTimeout(resolve, 4000);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

      if (transcript?.toLowerCase().includes(WAKE_COMMAND)) {
        status.value = "triggered";
        stopStream();
        await speak("Ok dimmi pure");
        if (!loopActive) break;
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
