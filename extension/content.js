(() => {
  if (window.__meetRecorderLoaded) return;
  window.__meetRecorderLoaded = true;

  let mediaRecorder = null;
  let chunks = [];
  let audioCtx = null;
  let tabTracks = [];
  let loopbackEl = null;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "meetRecorder_start") startRecording(msg.streamId, msg.backendUrl);
    if (msg.action === "meetRecorder_stop") stopRecording();
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

    // Loopback via <audio>: funziona con l'attivazione utente della pagina Meet
    // AudioContext parte suspended senza gesto diretto, <audio> no
    loopbackEl = document.createElement("audio");
    loopbackEl.srcObject = tabStream;
    loopbackEl.volume = 1;
    loopbackEl.play().catch(() => {});

    // AudioContext solo per mixare tab + mic nel recorder
    let sourceStream = tabStream;
    try {
      audioCtx = new AudioContext();
      await audioCtx.resume();
      const dest = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaStreamSource(tabStream).connect(dest);
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioCtx.createMediaStreamSource(mic).connect(dest);
      } catch {}
      sourceStream = dest.stream;
    } catch {
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
})();
