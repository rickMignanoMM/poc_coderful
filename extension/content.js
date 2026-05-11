chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'meetRecorder_ping') {
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'meetRecorder_start') {
    window.postMessage({ __mrSrc: 'ctrl', cmd: 'start', backendUrl: msg.backendUrl }, '*');
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'meetRecorder_stop') {
    window.postMessage({ __mrSrc: 'ctrl', cmd: 'stop' }, '*');
    sendResponse({ ok: true });
    return true;
  }
});

window.addEventListener('message', (e) => {
  if (!e.data || e.data.__mrSrc !== 'page') return;
  if (e.data.cmd === 'upload') {
    const { buffer, mimeType, filename, backendUrl } = e.data;
    chrome.runtime.sendMessage({ action: 'doUpload', buffer, mimeType, filename, backendUrl });
  }
});
