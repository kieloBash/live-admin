import { NextRequest, NextResponse } from "next/server";
import { getFullReport } from "@/lib/queries";
import { buildReportWorkbook } from "@/lib/excel";
import { sendReportEmail } from "@/lib/email";
import { dayBounds, rangeBounds, isValidDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST body: { date?, start?, end?, to?: string[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { date, start, end, to } = body ?? {};

    let s: Date, e: Date, label: string;
    if (isValidDate(date)) {
      ({ start: s, end: e } = dayBounds(date));
      label = date;
    } else if (isValidDate(start) && isValidDate(end)) {
      ({ start: s, end: e } = rangeBounds(start, end));
      label = `${start} to ${end}`;
    } else {
      return NextResponse.json(
        { error: "Provide `date` or both `start` and `end` (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    if (to && (!Array.isArray(to) || to.some((x: any) => typeof x !== "string"))) {
      return NextResponse.json(
        { error: "`to` must be an array of email strings." },
        { status: 400 }
      );
    }

    const data = await getFullReport(s, e);
    const buffer = await buildReportWorkbook(data, label);

    const result = await sendReportEmail({
      subject: `Sales Report — ${label}`,
      html: `<p>Sales report for <b>${label}</b> (sent manually).</p>
             <p>Invoices: ${data.summary.invoiceCount} ·
             Gross: ₱${(data.summary.grossTotal / 100).toFixed(2)}</p>`,
      filename: `sales-report-${label.replace(/\s+/g, "_")}.xlsx`,
      attachment: buffer,
      to,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("email route error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to email report" },
      { status: 500 }
    );
  }
}
