export function formatDateTime(iso) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeOnly(iso) {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayLabel(iso) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
