import { renderDailySummary, type DailySummaryData } from "@/lib/dailySummary";
import { dayBounds, priorDay, yesterday } from "@/lib/dates";
import { sendReportEmail } from "@/lib/email";
import { buildReportWorkbook } from "@/lib/excel";
import {
  getFullReport,
  getSummary,
} from "@/lib/queries";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protected by CRON_SECRET.
// Header: Authorization: Bearer <CRON_SECRET>  OR  ?secret=<CRON_SECRET>
//
// Runs yesterday's report, builds the Excel, and emails a rich HTML summary
// (with the Excel attached). Computes vs-yesterday from the day before.
async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const secret = bearer ?? searchParams.get("secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const date = yesterday();
    const prev = priorDay(date);

    const { start, end } = dayBounds(date);
    const { start: pStart, end: pEnd } = dayBounds(prev);

    // Main report (yesterday), prior-day summary for comparison, top products.
    const [report, prevSummary] = await Promise.all([
      getFullReport(start, end),
      getSummary(pStart, pEnd),
      // getTopProducts(start, end, 5),
    ]);

    const buffer = await buildReportWorkbook(report, date);

    const revenue = report.summary.subtotalTotal;
    const orders = report.summary.invoiceCount;
    const units = report.summary.itemCount;
    const avgOrderValue = orders > 0 ? revenue / orders : 0;

    // vs-yesterday %: only meaningful if the prior day had revenue.
    const prevRevenue = prevSummary.subtotalTotal;
    const hasComparison = prevRevenue > 0;
    const revenueVsYesterdayPct = hasComparison
      ? ((revenue - prevRevenue) / prevRevenue) * 100
      : 0;

    const summaryData: DailySummaryData = {
      date,
      revenue,
      orders,
      unitsSold: units,
      avgOrderValue,
      revenueVsYesterdayPct,
      hasComparison,
      joyjoyAmount: report.summary.joyjoyAmount,
      rtsTotal: report.summary.rtsTotal,
      topProducts: report.byCategory.map((c) => ({
        name: c.categoryName,
        units: c.itemCount,
        revenue: c.subtotal,

      })),
      topSellers: report.bySeller.slice(0, 5).map((s) => ({
        name: s.sellerName,
        orders: s.invoiceCount,
        revenue: s.subtotal,
        items: s.itemCount,
      })),
    };

    const html = renderDailySummary(summaryData);

    const result = await sendReportEmail({
      subject: `LiveAdmin Daily Sales Summary — ${date}`,
      html,
      filename: `daily-sales-${date}.xlsx`,
      attachment: buffer,
    });

    return NextResponse.json({ ok: true, date, ...result });
  } catch (err: any) {
    console.error("cron daily-report error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Cron failed" },
      { status: 500 }
    );
  }
}

export const POST = handler;
export const GET = handler;