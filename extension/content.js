let mediaRecorder = null;
let chunks = [];
let audioCtx = null;
let tabTracks = [];
let loopbackEl = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "meetRecorder_ping") {
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === "meetRecorder_start") {
    startRecording(msg.streamId, msg.backendUrl).catch(console.error);
  }
  if (msg.action === "meetRecorder_stop") {
    stopRecording();
  }
});

async function startRecording(streamId, backendUrl) {
  chunks = [];

  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
    video: false,
  });

  tabTracks = tabStream.getTracks();

  // <audio> per il loopback: usa l'attivazione utente di Meet, non AudioContext
  loopbackEl = document.createElement("audio");
  loopbackEl.srcObject = tabStream;
  loopbackEl.volume = 1;
  loopbackEl.play().catch(console.error);

  // AudioContext solo per mixare tab + mic nel recorder, NON per il playback
  let sourceStream = tabStream;
  try {
    audioCtx = new AudioContext();
    await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaStreamSource(tabStream).connect(dest);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioCtx.createMediaStreamSource(mic).connect(dest);
    } catch { /* mic non disponibile, registra solo tab */ }
    sourceStream = dest.stream;
  } catch (e) {
    console.warn("AudioContext fallback, registrazione solo tab:", e.message);
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
  }

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  mediaRecorder = new MediaRecorder(sourceStream, { mimeType });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const filename = `meet-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    chrome.runtime.sendMessage({ action: "doUpload", buffer, mimeType, filename, backendUrl });
  };
  mediaRecorder.start(1000);
}

function stopRecording() {
  if (mediaRecorder?.state !== "inactive") mediaRecorder.stop();
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  tabTracks.forEach(t => t.stop());
  tabTracks = [];
  if (loopbackEl) { loopbackEl.pause(); loopbackEl.srcObject = null; loopbackEl.remove(); loopbackEl = null; }
}
