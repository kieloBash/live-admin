// Weekly summary email HTML. Shows the week total (vs last week), a per-day
// breakdown (each day vs the same day last week), plus top categories and
// sellers for the week. All money on the item-price subtotal basis.

export interface WeeklyDayRow {
  dayLabel: string;     // "Sunday", "Monday", ...
  date: string;         // YYYY-MM-DD
  revenue: number;      // this week
  orders: number;
  unitsSold: number;
  joyjoyAmount: number;
  lastWeekRevenue: number;
  vsLastWeekPct: number;
  hasComparison: boolean;
}

export interface WeeklyTopRow {
  name: string;
  revenue: number;
  units: number;
  unitsSold: number;
  joyjoyAmount?: number;
  lastWeekRevenue?: number;
  vsLastWeekPct?: number;
  hasComparison?: boolean;
}

export interface WeeklySummaryData {
  weekLabel: string;        // "2026-08-01 to 2026-08-07"
  revenue: number;          // week total
  orders: number;
  unitsSold: number;
  avgOrderValue: number;

  lastWeekRevenue: number;
  weekVsLastWeekPct: number;
  hasWeekComparison: boolean;

  joyjoyAmount: number;
  rtsTotal: number;

  days: WeeklyDayRow[];
  topCategories: WeeklyTopRow[];
  topSellers: WeeklyTopRow[];
}

const fmtMoney = (n: number) =>
  "₱" +
  new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const delta = (pct: number, hasComparison = true) => {
  if (!hasComparison) return `<span style="color:#9ca3af;">—</span>`;
  const up = pct >= 0;
  const color = up ? "#059669" : "#dc2626";
  const arrow = up ? "▲" : "▼";
  return `<span style="color:${color};font-weight:600;">${arrow} ${Math.abs(
    pct
  ).toFixed(1)}%</span>`;
};

// Given a day's date (YYYY-MM-DD), return the same date one week earlier,
// formatted for display in the "vs last wk" header.
const lastWeekDateLabel = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
};

export function renderWeeklySummary(d: WeeklySummaryData): string {
  const metric = (label: string, value: string, sub?: string) => `
    <td style="padding:12px 16px;border:1px solid #e5e7eb;vertical-align:top;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">${label}</div>
      <div style="font-size:22px;font-weight:700;color:#111827;margin-top:4px;">${value}</div>
      ${sub ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${sub}</div>` : ""}
    </td>`;

  const dayRows = d.days
    .map(
      (day) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;color:#374151;">${day.dayLabel}<div style="font-size:11px;color:#9ca3af;">${day.date}</div></td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${day.orders}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${day.unitsSold}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#111827;">${fmtMoney(day.revenue)}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${fmtMoney(day.joyjoyAmount)}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${fmtMoney(day.lastWeekRevenue)}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;">${delta(day.vsLastWeekPct, day.hasComparison)}</td>
      </tr>`
    )
    .join("");

  const catRows = d.topCategories
    .map(
      (c, i) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;color:#374151;">${i + 1}. ${c.name}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${c.units} units</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#111827;">${fmtMoney(c.revenue)}</td>
      </tr>`
    )
    .join("");

  const sellerRows = d.topSellers
    .map(
      (s, i) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;color:#374151;">${i + 1}. ${s.name}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${s.units} orders</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${s.unitsSold} units sold</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#111827;">${fmtMoney(s.revenue)}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${fmtMoney(s.joyjoyAmount ?? 0)}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${s.lastWeekRevenue != null ? fmtMoney(s.lastWeekRevenue) : "—"}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;">${s.vsLastWeekPct != null ? delta(s.vsLastWeekPct, s.hasComparison ?? true) : `<span style="color:#9ca3af;">—</span>`}</td>
      </tr>`
    )
    .join("");

  // Header dates for the daily breakdown table: this week's range and the
  // matching date range from last week (based on the first/last day rows).
  const firstDay = d.days[0];
  const lastDay = d.days[d.days.length - 1];
  const revenueHeaderDate =
    firstDay && lastDay
      ? firstDay.date === lastDay.date
        ? firstDay.date
        : `${firstDay.date} – ${lastDay.date}`
      : "";
  const vsLastWkHeaderDate =
    firstDay && lastDay
      ? firstDay.date === lastDay.date
        ? lastWeekDateLabel(firstDay.date)
        : `${lastWeekDateLabel(firstDay.date)} – ${lastWeekDateLabel(lastDay.date)}`
      : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f9fafb;padding:24px;">
    <div style="background:#111827;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:20px;">LiveAdmin — Weekly Sales Summary</h1>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:14px;">${d.weekLabel}</p>
    </div>

    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;">

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          ${metric("Week Revenue", fmtMoney(d.revenue), d.hasWeekComparison ? `${delta(d.weekVsLastWeekPct)} vs last week` : "no prior-week data")}
          ${metric("Orders", String(d.orders), `${d.unitsSold} units sold`)}
        </tr>
        <tr>
          ${metric("Avg Order Value", fmtMoney(d.avgOrderValue))}
          ${metric("Last Week", fmtMoney(d.lastWeekRevenue))}
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          ${metric("JoyJoy Amount", fmtMoney(d.joyjoyAmount))}
          ${metric("RTS Total", fmtMoney(d.rtsTotal))}
        </tr>
      </table>

      <h2 style="font-size:15px;color:#111827;margin:0 0 8px;">📅 Daily Breakdown</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f9fafb;">
          <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;">Day</td>
          <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Orders</td>
          <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Units</td>
          <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Revenue<div style="font-weight:400;text-transform:none;font-size:10px;">${revenueHeaderDate}</div></td>
          <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">JoyJoy</td>
          <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Last Wk Revenue</td>
          <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">vs last wk<div style="font-weight:400;text-transform:none;font-size:10px;">${vsLastWkHeaderDate}</div></td>
        </tr>
        ${dayRows}
      </table>

      <h2 style="font-size:15px;color:#111827;margin:0 0 8px;">🏆 Top Categories</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        ${catRows || `<tr><td style="padding:8px 16px;color:#9ca3af;">No sales recorded</td></tr>`}
      </table>

      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:20px;">
        <h2 style="font-size:15px;color:#6b21a8;margin:0 0 12px;">🔴 Top Sellers</h2>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden;">
          <tr style="background:#f9fafb;">
            <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;">Seller</td>
            <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Orders</td>
            <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Units</td>
            <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Revenue</td>
            <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">JoyJoy</td>
            <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">Last Wk</td>
            <td style="padding:6px 16px;font-size:11px;color:#6b7280;text-transform:uppercase;text-align:right;">vs last wk</td>
          </tr>
          ${sellerRows || `<tr><td style="padding:8px 16px;color:#9ca3af;">No sales this week</td></tr>`}
        </table>
      </div>
    </div>

    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">
      Automated report from LiveAdmin · ${new Date().getFullYear()}
    </p>
  </div>`;
}