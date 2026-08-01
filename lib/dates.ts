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

// Weekly window helpers (Sunday -> Saturday).
// The report runs Saturday morning and covers the week that just ENDED on the
// most recent completed Saturday. Anchoring on "most recent Saturday" (not
// simply yesterday) keeps it correct even if the cron runs late, is retried,
// or is triggered manually on another weekday. Returns YYYY-MM-DD strings.
export function lastCompletedWeek(): { start: string; end: string } {
  const now = new Date();
  // Days since the most recent Saturday (Sat=6). If today IS Saturday, we use
  // last Saturday (7 days back), since today's sales aren't complete yet.
  const dow = now.getDay(); // Sun=0 .. Sat=6
  const daysSinceSat = ((dow - 6 + 7) % 7) || 7;
  const end = new Date(now);
  end.setDate(end.getDate() - daysSinceSat); // most recent completed Saturday
  const start = new Date(end);
  start.setDate(start.getDate() - 6); // back to that week's Sunday
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// The 7-day week immediately before a given Sun..Sat window.
export function priorWeek(startStr: string): { start: string; end: string } {
  const s = new Date(`${startStr}T00:00:00`);
  const prevEnd = new Date(s);
  prevEnd.setDate(prevEnd.getDate() - 1); // Saturday before
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - 6); // back to its Sunday
  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  };
}

// Day-of-week label for a YYYY-MM-DD string (Manila-safe: date-only, no tz math).
export function dayName(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
}