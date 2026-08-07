import ExcelJS from "exceljs";
import type {
  CategoryRow,
  DateRow,
  LineItem,
  PlatformRow,
  SellerRow,
  StatusInvoiceRow,
  Summary,
} from "./queries";

// Money is stored as whole units (not cents). Display as-is.
const CURRENCY_FMT = '"₱"#,##0.00;("₱"#,##0.00)';
const money = (v: number) => v;

type ReportData = {
  summary: Summary;
  bySeller: SellerRow[];
  byPlatform: PlatformRow[];
  byCategory: CategoryRow[];
  lineItems: LineItem[];
  byDate: DateRow[];
  joyjoyInvoices: StatusInvoiceRow[];
  rtsInvoices: StatusInvoiceRow[];
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell((c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    c.alignment = { vertical: "middle" };
  });
}

// Renders a one-row-per-invoice status sheet (used for JOYJOY and RTS).
function addStatusSheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: StatusInvoiceRow[]
) {
  const sh = wb.addWorksheet(name);
  sh.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "Invoice ID", key: "invoice", width: 26 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Seller", key: "seller", width: 22 },
    { header: "Customer", key: "customer", width: 22 },
    { header: "Platform", key: "platform", width: 16 },
    { header: "Items", key: "items", width: 10 },
    { header: "Subtotal", key: "subtotal", width: 18 },
  ];
  styleHeader(sh.getRow(1));
  rows.forEach((r) => {
    const row = sh.addRow({
      date: new Date(r.dateIssued),
      invoice: r.invoiceId,
      sku: r.sku,
      seller: r.sellerName,
      customer: r.customerName,
      platform: r.platformName,
      items: r.itemCount,
      subtotal: money(r.subtotal),
    });
    row.getCell(1).numFmt = "yyyy-mm-dd hh:mm";
    row.getCell(8).numFmt = CURRENCY_FMT;
    row.font = { name: "Arial" };
  });
  // Total row (subtotal only).
  if (rows.length > 0) {
    const totalRow = sh.addRow({
      customer: "TOTAL",
      items: rows.reduce((a, r) => a + r.itemCount, 0),
      subtotal: money(rows.reduce((a, r) => a + r.subtotal, 0)),
    });
    totalRow.font = { name: "Arial", bold: true };
    totalRow.getCell(8).numFmt = CURRENCY_FMT;
  }
}

export async function buildReportWorkbook(
  data: ReportData,
  label: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Live Admin Reports";
  wb.created = new Date();

  // ---- Summary ----
  const s = wb.addWorksheet("Summary");
  s.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 22 },
  ];
  styleHeader(s.getRow(1));
  s.addRow({ metric: "Report period", value: label });
  s.addRow({ metric: "Invoices (completed)", value: data.summary.invoiceCount });
  s.addRow({ metric: "Items sold", value: data.summary.itemCount });
  const sub = s.addRow({
    metric: "Total amount (subtotal)",
    value: money(data.summary.subtotalTotal),
  });
  s.addRow({ metric: "Freebies", value: data.summary.freebiesTotal });
  const jj = s.addRow({
    metric: "JoyJoy amount",
    value: money(data.summary.joyjoyAmount),
  });
  const rts = s.addRow({
    metric: "RTS total",
    value: money(data.summary.rtsTotal),
  });
  [sub, jj, rts].forEach((r) => (r.getCell(2).numFmt = CURRENCY_FMT));
  s.eachRow((r) => r.eachCell((c) => (c.font ??= { name: "Arial" })));

  // ---- By Date (all sellers combined) ----
  const ds = wb.addWorksheet("By Date");
  ds.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Total (subtotal)", key: "subtotal", width: 20 },
    { header: "JoyJoy Amount", key: "jjAmount", width: 18 },
    { header: "JoyJoy Quantity", key: "jjQty", width: 18 },
  ];
  styleHeader(ds.getRow(1));
  let totalSubtotalByDate = 0;
  let totalJoyjoyByDate = 0;
  let totalJoyjoyQtyByDate = 0;
  data.byDate.forEach((r) => {
    const row = ds.addRow({
      date: r.day,
      subtotal: money(r.subtotalAll),
      jjAmount: money(r.joyjoyAmount),
      jjQty: r.joyjoyQuantity,
    });
    totalSubtotalByDate += r.subtotalAll;
    totalJoyjoyByDate += r.joyjoyAmount;
    totalJoyjoyQtyByDate += r.joyjoyQuantity;
    row.getCell(2).numFmt = CURRENCY_FMT;
    row.getCell(3).numFmt = CURRENCY_FMT;
    row.font = { name: "Arial" };
  });
  const totalRowByDate = ds.addRow({
    date: "TOTAL",
    subtotal: money(totalSubtotalByDate),
    jjAmount: money(totalJoyjoyByDate),
    jjQty: totalJoyjoyQtyByDate,
  });
  totalRowByDate.getCell(2).numFmt = CURRENCY_FMT;
  totalRowByDate.getCell(3).numFmt = CURRENCY_FMT;
  totalRowByDate.font = { name: "Arial", bold: true };

  // ---- Per Seller ----
  const sel = wb.addWorksheet("Per Seller");
  sel.columns = [
    { header: "Seller (Completed)", key: "seller", width: 30 },
    { header: "Invoices (Completed)", key: "invoices", width: 14 },
    { header: "Subtotal (Completed)", key: "subtotal", width: 20 },
    { header: "Total Items (Completed)", key: "items", width: 14 },
  ];
  styleHeader(sel.getRow(1));
  let totalInvoicesbySeller = 0
  let totalItemsbySeller = 0
  let totalAmountbySeller = 0
  data.bySeller.forEach((r) => {
    const row = sel.addRow({
      seller: r.sellerName,
      invoices: r.invoiceCount,
      subtotal: money(r.subtotal),
      items: r.itemCount,
    });
    totalInvoicesbySeller += r.invoiceCount
    totalAmountbySeller += r.subtotal
    totalItemsbySeller += r.itemCount
    row.getCell(3).numFmt = CURRENCY_FMT;
    row.font = { name: "Arial" };
  });
  let totalRowBySeller = sel.addRow({
    seller: "TOTAL",
    invoices: totalInvoicesbySeller,
    subtotal: money(totalAmountbySeller),
    items: totalItemsbySeller,
  })
  totalRowBySeller.getCell(3).numFmt = CURRENCY_FMT;
  totalRowBySeller.font = { name: "Arial" };


  // ---- Per Platform ----
  const plat = wb.addWorksheet("Per Platform");
  plat.columns = [
    { header: "Platform", key: "platform", width: 30 },
    { header: "Invoices", key: "invoices", width: 14 },
    { header: "Subtotal", key: "subtotal", width: 20 },
  ];
  styleHeader(plat.getRow(1));
  let totalInvoicesByPlatform = 0
  let totalAmountByPlatform = 0
  data.byPlatform.forEach((r) => {
    const row = plat.addRow({
      platform: r.platformName,
      invoices: r.invoiceCount,
      subtotal: money(r.subtotal),
    });
    totalInvoicesByPlatform += r.invoiceCount;
    totalAmountByPlatform += r.subtotal
    row.getCell(3).numFmt = CURRENCY_FMT;
    row.font = { name: "Arial" };
  });
  let totalRowByPlatform = plat.addRow({
    platform: "TOTAL",
    invoices: totalInvoicesByPlatform,
    subtotal: money(totalAmountByPlatform)
  })
  totalRowByPlatform.getCell(3).numFmt = CURRENCY_FMT;
  totalRowByPlatform.font = { name: "Arial" };

  // ---- Per Category ----
  const cat = wb.addWorksheet("Per Category");
  cat.columns = [
    { header: "Category", key: "category", width: 30 },
    { header: "Items", key: "items", width: 14 },
    { header: "Subtotal", key: "subtotal", width: 20 },
  ];
  styleHeader(cat.getRow(1));
  let totalInvoicesByCategory = 0
  let totalAmountByCategory = 0
  data.byCategory.forEach((r) => {
    const row = cat.addRow({
      category: r.categoryName,
      items: r.itemCount,
      subtotal: money(r.subtotal),
    });
    totalInvoicesByCategory += r.itemCount
    totalAmountByCategory += r.subtotal
    row.getCell(3).numFmt = CURRENCY_FMT;
    row.font = { name: "Arial" };
  });
  let totalRowByCategory = cat.addRow({
    category: "TOTAL",
    items: totalInvoicesByCategory,
    subtotal: money(totalAmountByCategory)
  })
  totalRowByCategory.getCell(3).numFmt = CURRENCY_FMT;
  totalRowByCategory.font = { name: "Arial" };

  // ---- JOYJOY (one row per invoice) ----
  addStatusSheet(wb, "JoyJoy", data.joyjoyInvoices);

  // ---- RTS (one row per invoice) ----
  addStatusSheet(wb, "RTS", data.rtsInvoices);

  // ---- Line-item detail (completed) ----
  const li = wb.addWorksheet("Line Items");
  li.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "Invoice ID", key: "invoice", width: 26 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Seller", key: "seller", width: 24 },
    { header: "Customer", key: "customer", width: 24 },
    { header: "Platform", key: "platform", width: 18 },
    { header: "Category", key: "category", width: 18 },
    { header: "Status", key: "status", width: 14 },
    { header: "Item Price", key: "price", width: 16 },
    // { header: "Item Status", key: "status", width: 16 },
  ];
  styleHeader(li.getRow(1));
  data.lineItems.forEach((r) => {
    const row = li.addRow({
      date: new Date(r.dateIssued),
      invoice: r.invoiceId,
      sku: r.sku,
      seller: r.sellerName,
      customer: r.customerName,
      platform: r.platformName,
      category: r.categoryName,
      price: money(r.itemPrice),
      status: r.itemStatus
    });
    row.getCell(1).numFmt = "yyyy-mm-dd hh:mm";
    row.getCell(9).numFmt = CURRENCY_FMT;
    row.font = { name: "Arial" };
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}