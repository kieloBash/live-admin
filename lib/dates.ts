// All report queries filter on invoices."dateIssued" (timestamp without tz).
// We work in day boundaries [start, end) so an index range scan can be used.

export function dayBounds(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function rangeBounds(startStr: string, endStr: string) {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// The day before a given YYYY-MM-DD string.
export function priorDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}