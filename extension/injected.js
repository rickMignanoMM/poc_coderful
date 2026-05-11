(function () {
  if (window.__meetRecorderInjected) return;
  window.__meetRecorderInjected = true;

  // Remote audio tracks from RTCPeerConnection (no AudioContext needed)
  const audioTracks = new Set();
  let mediaRecorder = null;
  let chunks = [];
  let recBackendUrl = null;

  // Patch RTCPeerConnection to collect incoming audio tracks
  const OrigPC = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...args) {
    const pc = new OrigPC(...args);
    pc.addEventListener('track', ({ track }) => {
      if (track.kind !== 'audio') return;
      audioTracks.add(track);
      track.addEventListener('ended', () => audioTracks.delete(track), { once: true });
    });
    return pc;
  };
  Object.setPrototypeOf(window.RTCPeerConnection, OrigPC);
  window.RTCPeerConnection.prototype = OrigPC.prototype;

  // Commands from content.js
  window.addEventListener('message', async (e) => {
    if (!e.data || e.data.__mrSrc !== 'ctrl') return;
    if (e.data.cmd === 'start') await startRec(e.data.backendUrl);
    else if (e.data.cmd === 'stop') stopRec();
  });

  async function startRec(backendUrl) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') return;
    recBackendUrl = backendUrl;
    chunks = [];

    const liveTracks = Array.from(audioTracks).filter(t => t.readyState === 'live');

    // Add local microphone
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mic.getAudioTracks().forEach(t => liveTracks.push(t));
    } catch {}

    if (liveTracks.length === 0) {
      window.postMessage({ __mrSrc: 'page', cmd: 'error', error: 'no-tracks' }, '*');
      return;
    }

    const stream = new MediaStream(liveTracks);
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const filename = `meet-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      // Clone (no transfer list) for reliability across worlds
      window.postMessage({ __mrSrc: 'page', cmd: 'upload', buffer, mimeType, filename, backendUrl: recBackendUrl }, '*');
      mediaRecorder = null;
      chunks = [];
    };
    mediaRecorder.start(1000);
    window.postMessage({ __mrSrc: 'page', cmd: 'started', trackCount: liveTracks.length }, '*');
  }

  function stopRec() {
    if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
  }
})();
