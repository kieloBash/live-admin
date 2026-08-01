import { dayBounds, isValidDate, rangeBounds } from "@/lib/dates";
import { sendReportEmail } from "@/lib/email";
import { buildReportWorkbook } from "@/lib/excel";
import { getFullReport } from "@/lib/queries";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST body: { date?, start?, end?, email? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { date, start, end, email } = body ?? {};

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

    const data = await getFullReport(s, e);
    const buffer = await buildReportWorkbook(data, label);
    const filename = `sales-report-${label.replace(/\s+/g, "_")}.xlsx`;

    if (email) {
      const result = await sendReportEmail({
        subject: `Sales Report — ${label}`,
        html: `<p>Attached is the sales report for <b>${label}</b>.</p>
               <p>Invoices: ${data.summary.invoiceCount} ·
               Gross: ₱${(data.summary.subtotalTotal / 100).toFixed(2)}</p>`,
        filename,
        attachment: buffer,
      });
      return NextResponse.json({ ok: true, emailed: true, ...result });
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("generate error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to generate report" },
      { status: 500 }
    );
  }
}
