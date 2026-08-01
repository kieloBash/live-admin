import { NextRequest, NextResponse } from "next/server";
import { getFullReport } from "@/lib/queries";
import { buildReportWorkbook } from "@/lib/excel";
import { dayBounds, yesterday, isValidDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?date=YYYY-MM-DD&format=xlsx|json  (date omitted -> yesterday)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const format = searchParams.get("format") ?? "json";
    const date = isValidDate(dateParam) ? dateParam : yesterday();

    const { start, end } = dayBounds(date);
    const data = await getFullReport(start, end);

    if (format === "xlsx") {
      const buffer = await buildReportWorkbook(data, date);
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="sales-report-${date}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ date, ...data });
  } catch (err: any) {
    console.error("daily error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to build daily report" },
      { status: 500 }
    );
  }
}
