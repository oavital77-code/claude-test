export function formatTemp(tempC: number | null, digits = 1): string {
  if (tempC === null) return '—';
  return `${tempC.toFixed(digits)}°C`;
}

export function formatPercent(pct: number | null): string {
  if (pct === null) return '—';
  return `${Math.round(pct)}%`;
}

const timeFormatter = new Intl.DateTimeFormat('he-IL', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const shortTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatTime(ms: number): string {
  return timeFormatter.format(new Date(ms));
}

export function formatShortTime(ms: number): string {
  return shortTimeFormatter.format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return dateTimeFormatter.format(new Date(ms));
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
