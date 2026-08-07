// Builds the daily summary email HTML from real report data only.
// No viewer/conversion/refund/target metrics — those have no data source.
// The "quality" row shows JOYJOY and RTS totals instead of refunds.

export interface TopProduct {
  name: string;   // SKU (used as product identifier)
  revenue: number;
  units: number;
}

export interface TopSeller {
  name: string;
  revenue: number;
  orders: number;
  items: number;
}

export interface DailySummaryData {
  date: string;

  // Headline (all from item-price subtotal basis)
  revenue: number;
  orders: number;
  unitsSold: number;
  avgOrderValue: number;

  // Comparison
  revenueVsYesterdayPct: number;
  hasComparison: boolean;

  // Status quality (real: JOYJOY / RTS)
  joyjoyAmount: number;
  rtsTotal: number;

  topProducts: TopProduct[];
  topSellers: TopSeller[];

  notes?: string;
}

const fmtMoney = (n: number) =>
  "₱" +
  new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const delta = (pct: number) => {
  const up = pct >= 0;
  const color = up ? "#059669" : "#dc2626";
  const arrow = up ? "▲" : "▼";
  return `<span style="color:${color};font-weight:600;">${arrow} ${Math.abs(
    pct
  ).toFixed(1)}%</span>`;
};

export function renderDailySummary(d: DailySummaryData): string {
  const metric = (label: string, value: string, sub?: string) => `
    <td style="padding:12px 16px;border:1px solid #e5e7eb;vertical-align:top;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">${label}</div>
      <div style="font-size:22px;font-weight:700;color:#111827;margin-top:4px;">${value}</div>
      ${sub ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${sub}</div>` : ""}
    </td>`;

  const productRows = d.topProducts
    .map(
      (p, i) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;color:#374151;">${i + 1}. ${p.name}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${p.units} units</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#111827;">${fmtMoney(p.revenue)}</td>
      </tr>`
    )
    .join("");

  const sellerRows = d.topSellers
    .map(
      (s, i) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;color:#374151;">${i + 1}. ${s.name}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${s.orders} orders</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;color:#6b7280;">${s.items} units</td>
        <td style="padding:8px 16px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;color:#111827;">${fmtMoney(s.revenue)}</td>
      </tr>`
    )
    .join("");

  const aovSub = d.hasComparison
    ? `${delta(d.revenueVsYesterdayPct)} vs yesterday`
    : "no prior-day data";

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f9fafb;padding:24px;">
    <div style="background:#111827;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:20px;">LiveAdmin — Daily Sales Summary</h1>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:14px;">${d.date}</p>
    </div>

    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;">

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          ${metric("Revenue", fmtMoney(d.revenue), d.hasComparison ? `${delta(d.revenueVsYesterdayPct)} vs yesterday` : undefined)}
          ${metric("Orders", String(d.orders), `${d.unitsSold} units sold`)}
        </tr>
        <tr>
          ${metric("Avg Order Value", fmtMoney(d.avgOrderValue), aovSub)}
          ${metric("Units Sold", String(d.unitsSold))}
        </tr>
      </table>

      <!-- Status quality: JOYJOY / RTS (real data) -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          ${metric("JoyJoy Amount", fmtMoney(d.joyjoyAmount))}
          ${metric("RTS Total", fmtMoney(d.rtsTotal))}
        </tr>
      </table>

      <h2 style="font-size:15px;color:#111827;margin:0 0 8px;">🏆 Top Products</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        ${productRows || `<tr><td style="padding:8px 16px;color:#9ca3af;">No sales recorded</td></tr>`}
      </table>

      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:20px;margin-bottom:16px;">
        <h2 style="font-size:15px;color:#6b21a8;margin:0 0 12px;">🔴 Top Sellers</h2>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden;">
          ${sellerRows || `<tr><td style="padding:8px 16px;color:#9ca3af;">No sales today</td></tr>`}
        </table>
      </div>

      ${d.notes
      ? `<div style="background:#f3f4f6;padding:12px 16px;border-radius:6px;color:#374151;font-size:14px;">
               <strong>Notes:</strong> ${d.notes}
             </div>`
      : ""
    }
    </div>

    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">
      Automated report from LiveAdmin · ${new Date().getFullYear()}
    </p>
  </div>`;
}