chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "startRecording") {
    handleStart(msg.tabId, msg.backendUrl)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === "stopRecording") {
    handleStop().then(sendResponse);
    return true;
  }
  if (msg.action === "getState") {
    chrome.storage.session.get(["recording", "startTime", "lastUpload"]).then(sendResponse);
    return true;
  }
  if (msg.action === "doUpload") {
    handleUpload(msg);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "uploadDone" || msg.action === "uploadError") {
    chrome.storage.session.set({ recording: false, startTime: null, lastUpload: msg.action });
    setIcon(false);
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});

async function ping(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: "meetRecorder_ping" });
    return res?.ok === true;
  } catch {
    return false;
  }
}

async function handleStart(tabId, backendUrl) {
  const ready = await ping(tabId);
  if (!ready) {
    return { ok: false, error: "reload" };
  }

  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tabId, consumerTabId: tabId },
      (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      }
    );
  });

  await chrome.storage.session.set({ recording: true, startTime: Date.now(), tabId, lastUpload: null });
  setIcon(true);

  chrome.tabs.sendMessage(tabId, { action: "meetRecorder_start", streamId, backendUrl }).catch(() => {});
  return { ok: true };
}

async function handleStop() {
  const { tabId } = await chrome.storage.session.get(["tabId"]);
  if (tabId) chrome.tabs.sendMessage(tabId, { action: "meetRecorder_stop" }).catch(() => {});
  return { ok: true };
}

async function handleUpload({ buffer, mimeType, filename, backendUrl }) {
  try {
    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append("audio", blob, filename);
    const res = await fetch(`${backendUrl}/api/audio`, { method: "POST", body: form });
    const data = await res.json();
    const action = data.ok ? "uploadDone" : "uploadError";
    await chrome.storage.session.set({ recording: false, startTime: null, lastUpload: action });
    setIcon(false);
    chrome.runtime.sendMessage({ action }).catch(() => {});
  } catch (err) {
    await chrome.storage.session.set({ recording: false, startTime: null, lastUpload: "uploadError" });
    setIcon(false);
    chrome.runtime.sendMessage({ action: "uploadError", error: err.message }).catch(() => {});
  }
}

function setIcon(recording) {
  const suffix = recording ? "_rec" : "";
  chrome.action.setIcon({
    path: {
      16: `icons/icon16${suffix}.png`,
      48: `icons/icon48${suffix}.png`,
      128: `icons/icon128${suffix}.png`,
    },
  });
}
