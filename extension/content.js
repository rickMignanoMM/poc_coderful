let mediaRecorder = null;
let chunks = [];
let audioCtx = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "meetRecorder_start") startRecording(msg.streamId, msg.backendUrl);
  if (msg.action === "meetRecorder_stop") stopRecording();
});

async function startRecording(streamId, backendUrl) {
  chunks = [];

  // getUserMedia con consumerTabId=questo tab: cattura audio del tab
  // Il content script gira nel contesto reale del tab → AudioContext arriva agli speaker
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  audioCtx = new AudioContext();
  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  const recordDest = audioCtx.createMediaStreamDestination();

  tabSource.connect(audioCtx.destination); // loopback → speaker (funziona perché siamo nel tab)
  tabSource.connect(recordDest);           // → recorder

  // Prova a catturare anche il microfono; solo al recorder, mai agli speaker (feedback)
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx.createMediaStreamSource(micStream).connect(recordDest);
  } catch {}

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  mediaRecorder = new MediaRecorder(recordDest.stream, { mimeType });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.onstop = () => upload(backendUrl, mimeType);
  mediaRecorder.start(1000);
}

function stopRecording() {
  if (mediaRecorder?.state !== "inactive") mediaRecorder.stop();
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
}

async function upload(backendUrl, mimeType) {
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
