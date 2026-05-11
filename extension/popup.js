const DEFAULT_URL = "http://localhost:3000";

const elMain    = document.getElementById("main");
const elNotMeet = document.getElementById("not-meet");
const elDot     = document.getElementById("dot");
const elLabel   = document.getElementById("status-label");
const elTimer   = document.getElementById("timer");
const elStart   = document.getElementById("btn-start");
const elStop    = document.getElementById("btn-stop");
const elUrl     = document.getElementById("backend-url");
const elMsg     = document.getElementById("msg");

let timerInterval = null;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isMeet = tab?.url?.startsWith("https://meet.google.com/");

  if (!isMeet) {
    elNotMeet.style.display = "block";
    return;
  }
  elMain.style.display = "block";

  const stored = await chrome.storage.sync.get(["backendUrl"]);
  elUrl.value = stored.backendUrl || DEFAULT_URL;

  const state = await chrome.runtime.sendMessage({ action: "getState" });
  if (state?.recording) {
    setRecording(true, state.startTime);
  } else if (state?.lastUpload === "uploadDone") {
    showMsg("✓ Nota inviata al Backoffice!", true);
    chrome.storage.session.set({ lastUpload: null });
  } else if (state?.lastUpload === "uploadError") {
    showMsg("Errore upload — controlla il Backoffice", false);
    chrome.storage.session.set({ lastUpload: null });
  }

  elUrl.addEventListener("change", () => {
    chrome.storage.sync.set({ backendUrl: elUrl.value.trim() || DEFAULT_URL });
  });

  elStart.addEventListener("click", async () => {
    const url = elUrl.value.trim() || DEFAULT_URL;
    chrome.storage.sync.set({ backendUrl: url });
    showMsg(null);

    elStart.disabled = true;
    elLabel.textContent = "Avvio...";

    const res = await chrome.runtime.sendMessage({
      action: "startRecording",
      tabId: tab.id,
      backendUrl: url,
    });

    elStart.disabled = false;

    if (res?.ok) {
      setRecording(true, Date.now());
    } else if (res?.error === "reload") {
      setRecording(false);
      showMsg("⟳ Ricarica il tab di Meet (F5) e riprova", false);
    } else {
      setRecording(false);
      showMsg("Errore: " + (res?.error || "impossibile avviare"), false);
    }
  });

  elStop.addEventListener("click", async () => {
    elStop.disabled = true;
    setUploading();
    await chrome.runtime.sendMessage({ action: "stopRecording" });

    // Ascolta il completamento upload
    const listener = (msg) => {
      if (msg.action === "uploadDone") {
        chrome.runtime.onMessage.removeListener(listener);
        setRecording(false);
        showMsg("✓ Nota inviata al Backoffice!", true);
        elStop.disabled = false;
      }
      if (msg.action === "uploadError") {
        chrome.runtime.onMessage.removeListener(listener);
        setRecording(false);
        showMsg("Errore upload: " + (msg.error || "controlla il Backoffice"), false);
        elStop.disabled = false;
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Timeout sicurezza: se dopo 60s non arriva risposta
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      if (elStop.disabled) {
        setRecording(false);
        elStop.disabled = false;
        showMsg("Timeout upload — riprova.", false);
      }
    }, 60000);
  });
}

function setRecording(active, startTime = null) {
  clearInterval(timerInterval);

  if (active) {
    elDot.className = "dot active";
    elLabel.textContent = "Registrazione in corso";
    elTimer.style.display = "block";
    elStart.style.display = "none";
    elStop.style.display = "block";

    const tick = () => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      elTimer.textContent = `${mm}:${ss}`;
    };
    tick();
    timerInterval = setInterval(tick, 1000);
  } else {
    elDot.className = "dot idle";
    elLabel.textContent = "Pronto";
    elTimer.style.display = "none";
    elTimer.textContent = "";
    elStart.style.display = "block";
    elStop.style.display = "none";
  }
}

function setUploading() {
  clearInterval(timerInterval);
  elDot.className = "dot uploading";
  elLabel.textContent = "Invio in corso...";
  elTimer.style.display = "none";
}

function showMsg(text, ok = true) {
  if (!text) { elMsg.className = "msg"; elMsg.textContent = ""; return; }
  elMsg.className = ok ? "msg ok" : "msg error";
  elMsg.textContent = text;
}

init();
