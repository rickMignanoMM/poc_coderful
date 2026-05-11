(function () {
  if (window.__meetRecorderInjected) return;
  window.__meetRecorderInjected = true;

  let mediaRecorder = null;
  let chunks = [];
  let loopbackEl = null;
  let micStream = null;
  let audioCtx = null;
  let recBackendUrl = null;

  // Commands from content.js via window.postMessage
  window.addEventListener('message', async (e) => {
    if (!e.data || e.data.__mrSrc !== 'ctrl') return;
    if (e.data.cmd === 'start') await startRec(e.data.streamId, e.data.backendUrl);
    else if (e.data.cmd === 'stop') stopRec();
  });

  async function startRec(streamId, backendUrl) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') return;
    recBackendUrl = backendUrl;
    chunks = [];

    // Get tab audio via tabCapture stream ID (runs in MAIN world — page has prior user interaction)
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false,
    });

    // Loopback: re-play captured tab audio so user still hears the call
    loopbackEl = document.createElement('audio');
    loopbackEl.srcObject = tabStream;
    loopbackEl.volume = 1;
    loopbackEl.play().catch(() => {});

    // Mix tab + mic via AudioContext
    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch {}
    }
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaStreamSource(tabStream).connect(dest);

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioCtx.createMediaStreamSource(micStream).connect(dest);
    } catch {}

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';

    mediaRecorder = new MediaRecorder(dest.stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const filename = `meet-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      window.postMessage({ __mrSrc: 'page', cmd: 'upload', buffer, mimeType, filename, backendUrl: recBackendUrl }, '*');
      cleanup();
    };
    mediaRecorder.start(1000);
    window.postMessage({ __mrSrc: 'page', cmd: 'started' }, '*');
  }

  function stopRec() {
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
  }

  function cleanup() {
    if (loopbackEl) { loopbackEl.pause(); loopbackEl.srcObject = null; loopbackEl.remove(); loopbackEl = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    mediaRecorder = null;
    chunks = [];
  }
})();
