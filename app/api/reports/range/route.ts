import { NextRequest, NextResponse } from "next/server";
import { getFullReport } from "@/lib/queries";
import { buildReportWorkbook } from "@/lib/excel";
import { rangeBounds, isValidDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD&format=xlsx|json  (end inclusive)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const format = searchParams.get("format") ?? "json";

    if (!isValidDate(start) || !isValidDate(end)) {
      return NextResponse.json(
        { error: "start and end are required (YYYY-MM-DD)." },
        { status: 400 }
      );
    }
    if (start > end) {
      return NextResponse.json(
        { error: "start must be on or before end." },
        { status: 400 }
      );
    }

    const { start: s, end: e } = rangeBounds(start, end);
    const data = await getFullReport(s, e);
    const label = `${start} to ${end}`;

    if (format === "xlsx") {
      const buffer = await buildReportWorkbook(data, label);
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="sales-report-${start}_to_${end}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ start, end, ...data });
  } catch (err: any) {
    console.error("range error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to build range report" },
      { status: 500 }
    );
  }
}
