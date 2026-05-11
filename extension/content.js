// Guard contro doppia iniezione se executeScript viene chiamato su tab già inizializzato
if (window.__meetRecorderLoaded) throw new Error("already loaded");
window.__meetRecorderLoaded = true;

let mediaRecorder = null;
let chunks = [];
let audioCtx = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "meetRecorder_start") startRecording(msg.streamId, msg.backendUrl);
  if (msg.action === "meetRecorder_stop") stopRecording();
});

async function startRecording(streamId, backendUrl) {
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

  audioCtx = new AudioContext();
  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  const recordDest = audioCtx.createMediaStreamDestination();

  tabSource.connect(audioCtx.destination); // loopback → speaker
  tabSource.connect(recordDest);

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx.createMediaStreamSource(micStream).connect(recordDest);
  } catch {}

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  mediaRecorder = new MediaRecorder(recordDest.stream, { mimeType });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  // L'upload va al background: niente mixed-content, service worker non può essere terminato durante il fetch
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    const filename = `meet-${new Date().toISOString().replace(/[:.]/g, "-")}.${mimeType.includes("webm") ? "webm" : "ogg"}`;
    chrome.runtime.sendMessage({ action: "doUpload", buffer, mimeType, filename, backendUrl });
  };
  mediaRecorder.start(1000);
}

function stopRecording() {
  if (mediaRecorder?.state !== "inactive") mediaRecorder.stop();
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
}
