import { formatDayLabel } from "./dateTime.js";

export const TYPE_LABELS = {
  eventi: "📅 Eventi",
  riassunto: "📊 Riassunto",
  suggerimenti: "💡 Suggerimenti",
  connessioni: "🔗 Connessioni",
};

export const RECAP_SECTIONS = [
  { key: "tutti", label: "Tutto" },
  { key: "riassunto", label: "📊 Riassunto" },
  { key: "eventi", label: "📅 Eventi" },
  { key: "suggerimenti", label: "💡 Suggerimenti" },
  { key: "connessioni", label: "🔗 Connessioni" },
];

export function filterNotes(notes, search) {
  const query = search.trim().toLowerCase();
  if (!query) return notes;

  return notes.filter((note) =>
    (note.testo_pulito || note.testo || "").toLowerCase().includes(query),
  );
}

export function groupNotesByDay(notes) {
  const groups = {};
  const order = [];

  notes.forEach((note) => {
    const createdAt = new Date(note.createdAt);
    const dayKey = createdAt.toISOString().slice(0, 10);

    if (!groups[dayKey]) {
      groups[dayKey] = {
        dayKey,
        dayLabel: formatDayLabel(note.createdAt),
        notes: [],
      };
      order.push(dayKey);
    }

    groups[dayKey].notes.push(note);
  });

  return order.map((dayKey) => groups[dayKey]);
}

export function buildStats(notes) {
  const total = notes.length;
  const completed = notes.filter((note) => note.status === "completata").length;
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const weekCount = notes.filter((note) => new Date(note.createdAt).getTime() > cutoff).length;

  const perHour = Array(24).fill(0);
  notes.forEach((note) => {
    perHour[new Date(note.createdAt).getHours()]++;
  });

  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  const dayCounts = Array(7).fill(0);
  notes.forEach((note) => {
    dayCounts[new Date(note.createdAt).getDay()]++;
  });

  const sentimentMap = {};
  notes.forEach((note) => {
    if (!note.sentiment?.tono) return;

    const key = note.sentiment.tono;
    sentimentMap[key] = sentimentMap[key] || {
      tono: key,
      emoji: note.sentiment.emoji || "😐",
      count: 0,
    };
    sentimentMap[key].count++;
  });

  const sentimentList = Object.values(sentimentMap).sort((a, b) => b.count - a.count);
  const hasSentiment = sentimentList.length > 0;
  const sentimentTop = sentimentList[0] || { tono: "—", emoji: "😐" };

  return {
    total,
    completed,
    weekCount,
    perHour,
    maxHour: Math.max(...perHour, 1),
    perDay: days.map((label, index) => ({ label, count: dayCounts[index] })),
    maxDay: Math.max(...dayCounts, 1),
    sentimentList,
    hasSentiment,
    sentimentTop,
  };
}

export function parseEventDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isNaN(date.getTime()) && date.getFullYear() > 2020) {
    return date;
  }

  const months = {
    gennaio: 0,
    febbraio: 1,
    marzo: 2,
    aprile: 3,
    maggio: 4,
    giugno: 5,
    luglio: 6,
    agosto: 7,
    settembre: 8,
    ottobre: 9,
    novembre: 10,
    dicembre: 11,
  };

  const monthMatch = value.match(
    /(\d{1,2})\s+([a-zà-ü]+)\s+(\d{4})(?:[^\d]+(\d{1,2})[:\s](\d{2}))?/i,
  );
  if (monthMatch && months[monthMatch[2].toLowerCase()] !== undefined) {
    return new Date(
      Number(monthMatch[3]),
      months[monthMatch[2].toLowerCase()],
      Number(monthMatch[1]),
      monthMatch[4] ? Number(monthMatch[4]) : 0,
      monthMatch[5] ? Number(monthMatch[5]) : 0,
    );
  }

  const numericMatch = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (numericMatch) {
    return new Date(
      Number(numericMatch[3]),
      Number(numericMatch[2]) - 1,
      Number(numericMatch[1]),
    );
  }

  return null;
}

export function buildCalendarUrl(event) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.titolo,
  });

  if (event.contesto) params.set("details", event.contesto);

  const parsedDate = parseEventDate(event.data);
  if (parsedDate) {
    const hasTime = /\d{1,2}[:h]\d{2}/.test(event.data || "");
    const start = formatCalendarDate(parsedDate, hasTime);
    const end = hasTime
      ? formatCalendarDate(new Date(parsedDate.getTime() + 3600000), true)
      : formatCalendarDate(
          new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + 1),
          false,
        );

    params.set("dates", `${start}/${end}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function formatCalendarDate(date, includeTime) {
  const pad = (value) => String(value).padStart(2, "0");
  const base = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

  if (!includeTime) return base;

  return `${base}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}
