(function () {
  if (window.__meetRecorderInjected) return;
  window.__meetRecorderInjected = true;

  let audioCtx = null;
  let destNode = null;
  const connectedIds = new Set();
  let mediaRecorder = null;
  let chunks = [];
  let recBackendUrl = null;

  // Patch RTCPeerConnection to intercept remote audio tracks
  const OrigPC = window.RTCPeerConnection;
  class PatchedPC extends OrigPC {
    constructor(...args) {
      super(...args);
      this.addEventListener('track', ({ track }) => {
        if (track.kind === 'audio') hookTrack(track);
      });
    }
  }
  window.RTCPeerConnection = PatchedPC;

  function ensureCtx() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext();
      destNode = audioCtx.createMediaStreamDestination();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }

  function hookTrack(track) {
    if (connectedIds.has(track.id)) return;
    connectedIds.add(track.id);
    ensureCtx();
    const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
    src.connect(destNode);
    track.addEventListener('ended', () => {
      connectedIds.delete(track.id);
      try { src.disconnect(); } catch {}
    }, { once: true });
  }

  // Commands from content.js via window.postMessage
  window.addEventListener('message', async (e) => {
    if (!e.data || e.data.__mrSrc !== 'ctrl') return;
    if (e.data.cmd === 'start') await startRec(e.data.backendUrl);
    else if (e.data.cmd === 'stop') stopRec();
  });

  async function startRec(backendUrl) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') return;
    recBackendUrl = backendUrl;
    chunks = [];

    ensureCtx();
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch {}
    }

    // Include local microphone alongside remote tracks
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioCtx.createMediaStreamSource(mic).connect(destNode);
    } catch {}

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';

    mediaRecorder = new MediaRecorder(destNode.stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const filename = `meet-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      window.postMessage(
        { __mrSrc: 'page', cmd: 'upload', buffer, mimeType, filename, backendUrl: recBackendUrl },
        '*',
        [buffer]
      );
      mediaRecorder = null;
      chunks = [];
    };
    mediaRecorder.start(1000);
    window.postMessage({ __mrSrc: 'page', cmd: 'started' }, '*');
  }

  function stopRec() {
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
  }
})();
