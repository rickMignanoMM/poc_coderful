let mediaRecorder = null;
let chunks = [];
let tabTracks = [];
let loopbackEl = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "meetRecorder_ping") {
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === "meetRecorder_start") {
    startRecording(msg.streamId, msg.backendUrl).catch(err => {
      console.error("[MeetRecorder] start failed:", err);
      chrome.runtime.sendMessage({ action: "uploadError", error: err.message });
    });
  }
  if (msg.action === "meetRecorder_stop") {
    stopRecording();
  }
});

async function startRecording(streamId, backendUrl) {
  chunks = [];

  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false,
  });

  tabTracks = tabStream.getTracks();

  // Loopback: re-play tab audio so user still hears the call
  loopbackEl = document.createElement("audio");
  loopbackEl.srcObject = tabStream;
  loopbackEl.volume = 1;
  document.documentElement.appendChild(loopbackEl);
  loopbackEl.play().catch(e => console.warn("[MeetRecorder] loopback play failed:", e.message));

  // Build recording stream: tab audio + mic (mixed via multi-track MediaStream)
  const allTracks = [...tabStream.getAudioTracks()];
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    mic.getAudioTracks().forEach(t => allTracks.push(t));
  } catch {}

  const recStream = new MediaStream(allTracks);
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  mediaRecorder = new MediaRecorder(recStream, { mimeType });
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
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
  tabTracks.forEach(t => t.stop());
  tabTracks = [];
  if (loopbackEl) { loopbackEl.pause(); loopbackEl.srcObject = null; loopbackEl.remove(); loopbackEl = null; }
}
