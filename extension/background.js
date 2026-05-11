const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Acquisizione e riproduzione audio tab Google Meet",
  });
}

async function closeOffscreen() {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

function sendToOffscreen(msg) {
  return chrome.runtime.sendMessage({ ...msg, target: "offscreen" });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target === "offscreen") return false;

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
    chrome.storage.session
      .get(["recording", "startTime", "backendUrl"])
      .then(sendResponse);
    return true;
  }

  if (msg.action === "uploadDone") {
    chrome.storage.session.set({ recording: false, startTime: null });
    setIcon(false);
    closeOffscreen();
  }

  if (msg.action === "uploadError") {
    chrome.storage.session.set({ recording: false, startTime: null });
    setIcon(false);
    closeOffscreen();
  }
});

async function handleStart(tabId, backendUrl) {
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });

  await ensureOffscreen();
  await chrome.storage.session.set({ recording: true, startTime: Date.now(), backendUrl });
  setIcon(true);

  await sendToOffscreen({ action: "offscreen_start", streamId, backendUrl });
  return { ok: true };
}

async function handleStop() {
  await sendToOffscreen({ action: "offscreen_stop" });
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
