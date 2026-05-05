import { ref, readonly } from "vue";

const STORAGE_KEY = "backendUrl";
const baseUrl = ref(localStorage.getItem(STORAGE_KEY) || "");

export function setBackend(url) {
  baseUrl.value = url;
  if (url) localStorage.setItem(STORAGE_KEY, url);
  else localStorage.removeItem(STORAGE_KEY);
}

export async function apiFetch(path, options) {
  const base = baseUrl.value;
  const url = base ? `${base.replace(/\/$/, "")}${path}` : path;
  try {
    return await fetch(url, options);
  } catch {
    if (base) {
      // Backend configurato non raggiungibile (es. cert self-signed bloccato),
      // torno all'origin della pagina corrente e resetto la preferenza
      setBackend("");
      return fetch(path, options);
    }
    throw new Error(`Impossibile raggiungere il backend`);
  }
}

export function mediaUrl(path) {
  const base = baseUrl.value;
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

export function useApi() {
  return { baseUrl: readonly(baseUrl), setBackend, apiFetch, mediaUrl };
}
