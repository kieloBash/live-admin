import {
    dayName,
    lastCompletedWeek,
    priorWeek,
    rangeBounds,
} from "@/lib/dates";
import { sendReportEmail } from "@/lib/email";
import { buildReportWorkbook } from "@/lib/excel";
import {
    getDailyPoints,
    getFullReport,
    getSummary,
} from "@/lib/queries";
import {
    renderWeeklySummary,
    type WeeklyDayRow,
    type WeeklySummaryData,
} from "@/lib/weeklySummary";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly report. Runs Saturday morning; covers the Sun..Sat week that just
// ended yesterday. One Excel for the whole week + a summary email with a
// per-day breakdown and both week-total and per-day last-week comparisons.
//
// Protected by CRON_SECRET (Bearer header or ?secret=).
async function handler(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const auth = req.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const secret = bearer ?? searchParams.get("secret");

    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Allow manual override: ?start=YYYY-MM-DD&end=YYYY-MM-DD
        const overrideStart = searchParams.get("start");
        const overrideEnd = searchParams.get("end");
        const week =
            overrideStart && overrideEnd
                ? { start: overrideStart, end: overrideEnd }
                : lastCompletedWeek();
        const prev = priorWeek(week.start);

        const { start, end } = rangeBounds(week.start, week.end);
        const { start: pStart, end: pEnd } = rangeBounds(prev.start, prev.end);

        // Full report (this week) for the Excel + summary/sellers/categories,
        // prior-week summary for the week-total comparison,
        // per-day points for both weeks for the daily breakdown.
        const [report, prevSummary, thisDays, prevDays] = await Promise.all([
            getFullReport(start, end),
            getSummary(pStart, pEnd),
            getDailyPoints(start, end),
            getDailyPoints(pStart, pEnd),
        ]);

        const label = `${week.start} to ${week.end}`;
        const buffer = await buildReportWorkbook(report, label);

        const revenue = report.summary.subtotalTotal;
        const orders = report.summary.invoiceCount;
        const units = report.summary.itemCount;
        const avgOrderValue = orders > 0 ? revenue / orders : 0;

        const lastWeekRevenue = prevSummary.subtotalTotal;
        const hasWeekComparison = lastWeekRevenue > 0;
        const weekVsLastWeekPct = hasWeekComparison
            ? ((revenue - lastWeekRevenue) / lastWeekRevenue) * 100
            : 0;

        // Map both weeks by day-of-week index (0=Sun..6=Sat) so we compare
        // same-day-of-week rather than raw dates.
        const prevByDow = new Map<number, number>();
        for (const p of prevDays) {
            const dow = new Date(`${p.day}T00:00:00`).getDay();
            prevByDow.set(dow, p.revenue);
        }
        const thisByDate = new Map(thisDays.map((p) => [p.day, p]));

        // Build all 7 days of the week window (fill missing days with zeros).
        const days: WeeklyDayRow[] = [];
        const cursor = new Date(`${week.start}T00:00:00`);
        const endDate = new Date(`${week.end}T00:00:00`);
        while (cursor <= endDate) {
            const dateStr = cursor.toISOString().slice(0, 10);
            const dow = cursor.getDay();
            const point = thisByDate.get(dateStr);
            const rev = point?.revenue ?? 0;
            const ord = point?.orders ?? 0;
            const lwRev = prevByDow.get(dow) ?? 0;
            const hasComparison = lwRev > 0;
            days.push({
                dayLabel: dayName(dateStr),
                date: dateStr,
                revenue: rev,
                orders: ord,
                lastWeekRevenue: lwRev,
                vsLastWeekPct: hasComparison ? ((rev - lwRev) / lwRev) * 100 : 0,
                hasComparison,
            });
            cursor.setDate(cursor.getDate() + 1);
        }

        const summaryData: WeeklySummaryData = {
            weekLabel: label,
            revenue,
            orders,
            unitsSold: units,
            avgOrderValue,
            lastWeekRevenue,
            weekVsLastWeekPct,
            hasWeekComparison,
            joyjoyAmount: report.summary.joyjoyAmount,
            rtsTotal: report.summary.rtsTotal,
            days,
            topCategories: report.byCategory.slice(0, 5).map((c) => ({
                name: c.categoryName,
                units: c.itemCount,
                revenue: c.subtotal,
            })),
            topSellers: report.bySeller.slice(0, 5).map((s) => ({
                name: s.sellerName,
                units: s.invoiceCount,
                revenue: s.subtotal,
            })),
        };

        const html = renderWeeklySummary(summaryData);

        const result = await sendReportEmail({
            subject: `LiveAdmin Weekly Sales Summary — ${label}`,
            html,
            filename: `weekly-sales-${week.start}_to_${week.end}.xlsx`,
            attachment: buffer,
        });

        return NextResponse.json({ ok: true, week: label, ...result });
    } catch (err: any) {
        console.error("cron weekly-report error:", err);
        return NextResponse.json(
            { error: err?.message ?? "Weekly cron failed" },
            { status: 500 }
        );
    }
}

export const POST = handler;
export const GET = handler;