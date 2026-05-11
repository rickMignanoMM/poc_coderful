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
    chrome.storage.session.get(["recording", "startTime"]).then(sendResponse);
    return true;
  }
  if (msg.action === "uploadDone" || msg.action === "uploadError") {
    chrome.storage.session.set({ recording: false, startTime: null });
    setIcon(false);
  }
});

async function handleStart(tabId, backendUrl) {
  // consumerTabId = tabId → lo stream ID può essere consumato dal content script in quel tab
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tabId, consumerTabId: tabId },
      (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      }
    );
  });

  await chrome.storage.session.set({ recording: true, startTime: Date.now(), tabId });
  setIcon(true);

  chrome.tabs.sendMessage(tabId, { action: "meetRecorder_start", streamId, backendUrl });
  return { ok: true };
}

async function handleStop() {
  const { tabId } = await chrome.storage.session.get(["tabId"]);
  if (tabId) chrome.tabs.sendMessage(tabId, { action: "meetRecorder_stop" });
  return { ok: true };
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
