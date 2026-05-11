let mediaRecorder = null;
let chunks = [];
let backendUrl = "http://localhost:3000";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.action === "offscreen_start") startRecording(msg.streamId, msg.backendUrl);
  if (msg.action === "offscreen_stop") stopRecording();
});

async function startRecording(streamId, url) {
  backendUrl = url || "http://localhost:3000";
  chunks = [];

  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Prova a catturare anche il microfono locale; se l'utente nega, si registra solo l'audio del tab
  let micStream = null;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    // nessun microfono disponibile — solo audio remoto
  }

  let sourceStream = tabStream;

  if (micStream) {
    const ctx = new AudioContext();
    const tabSource = ctx.createMediaStreamSource(tabStream);
    const micSource = ctx.createMediaStreamSource(micStream);
    const dest = ctx.createMediaStreamDestination();
    tabSource.connect(dest);
    micSource.connect(dest);
    sourceStream = dest.stream;
  }

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  mediaRecorder = new MediaRecorder(sourceStream, { mimeType });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.onstop = () => uploadRecording(mimeType);
  mediaRecorder.start(1000);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

async function uploadRecording(mimeType) {
  const ext = mimeType.includes("webm") ? "webm" : "ogg";
  const blob = new Blob(chunks, { type: mimeType });
  const filename = `meet-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

  const form = new FormData();
  form.append("audio", blob, filename);

  try {
    const res = await fetch(`${backendUrl}/api/audio`, { method: "POST", body: form });
    const data = await res.json();
    chrome.runtime.sendMessage({ action: data.ok ? "uploadDone" : "uploadError", data });
  } catch (err) {
    chrome.runtime.sendMessage({ action: "uploadError", error: err.message });
  }
}
