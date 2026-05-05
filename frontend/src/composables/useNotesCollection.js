import { onUnmounted, ref } from "vue";

export function useNotesCollection(apiFetch, { pollIntervalMs = 4000 } = {}) {
  const notes = ref([]);
  const loading = ref(true);

  let pollHandle = null;
  let activePollIntervalMs = pollIntervalMs;

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  function startPolling(intervalMs = activePollIntervalMs) {
    const shouldResetTimer = pollHandle && intervalMs !== activePollIntervalMs;
    activePollIntervalMs = intervalMs;

    if (shouldResetTimer) stopPolling();
    if (!pollHandle) pollHandle = setInterval(() => loadNotes(false), activePollIntervalMs);
  }

  function syncPolling(intervalMs = activePollIntervalMs) {
    const hasPending = notes.value.some((note) => note.status === "in_elaborazione");

    if (hasPending) startPolling(intervalMs);
    else stopPolling();
  }

  async function loadNotes(showLoading = true) {
    if (showLoading) loading.value = true;

    try {
      const res = await apiFetch("/api/notes");
      notes.value = await res.json();
    } finally {
      if (showLoading) loading.value = false;
    }

    syncPolling();
  }

  function setNotes(value, { sync = true, pollMs = activePollIntervalMs } = {}) {
    notes.value = value;
    if (sync) syncPolling(pollMs);
  }

  function updateNote(id, updater, options) {
    setNotes(
      notes.value.map((note) => (note.id === id ? updater(note) : note)),
      options,
    );
  }

  function removeNote(id, options) {
    setNotes(
      notes.value.filter((note) => note.id !== id),
      options,
    );
  }

  onUnmounted(stopPolling);

  return {
    notes,
    loading,
    loadNotes,
    setNotes,
    updateNote,
    removeNote,
    startPolling,
    stopPolling,
    syncPolling,
  };
}
