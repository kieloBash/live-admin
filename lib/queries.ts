import { prisma } from "./prisma";

// MONEY POLICY: an invoice's "subtotal" is defined as the SUM of its items'
// prices (items.price), computed at query time. The stored invoice fields
// "subTotal", "grandTotal", and "tax" are intentionally ignored everywhere.
// A status/invoice with no items sums to 0.
//
// CONSISTENCY: summary, seller, platform, category, by-date, and the JOYJOY/RTS
// tabs all sum items.price, so every breakdown cross-foots against the others.
//
// FAN-OUT RULE: when a query LEFT JOINs items to sum price, any invoice-level
// aggregate (COUNT of invoices, SUM of freebies) must use COUNT(DISTINCT inv.id)
// or be computed in a separate join-free query -- otherwise it is multiplied by
// the number of items per invoice.
//
// QUOTING: camelCase columns and hyphenated table names must be double-quoted
// in raw SQL. $queryRaw parameterizes ${..} safely.

export type Summary = {
  invoiceCount: number;   // COMPLETED invoices
  itemCount: number;      // items on COMPLETED invoices
  subtotalTotal: number;  // SUM item.price, COMPLETED
  freebiesTotal: number;  // COMPLETED
  joyjoyAmount: number;   // SUM item.price where status = JOYJOY
  rtsTotal: number;       // SUM item.price where status = RTS
};

export type SellerRow = {
  sellerId: string;
  sellerName: string;
  invoiceCount: number;
  itemCount: number;
  subtotal: number;
};

export type PlatformRow = {
  platformId: string;
  platformName: string;
  invoiceCount: number;
  subtotal: number;
};

export type CategoryRow = {
  categoryId: string;
  categoryName: string;
  itemCount: number;
  subtotal: number;
};

export type LineItem = {
  invoiceId: string;
  sku: string;
  dateIssued: Date;
  sellerName: string;
  customerName: string;
  platformName: string;
  categoryName: string;
  itemPrice: number;
  itemStatus: string;
};

export type DateRow = {
  day: string;             // YYYY-MM-DD (Manila)
  subtotalAll: number;     // SUM item.price, all statuses
  joyjoyAmount: number;    // SUM item.price where JOYJOY
  joyjoyQuantity: number;  // item count where JOYJOY
};

// One row per invoice, for the dedicated JOYJOY and RTS tabs.
export type StatusInvoiceRow = {
  invoiceId: string;
  sku: string;
  dateIssued: Date;
  sellerName: string;
  customerName: string;
  platformName: string;
  subtotal: number;        // SUM item.price for that invoice
  itemCount: number;
};

const n = (v: unknown): number => (v == null ? 0 : Number(v));

// Top products by SKU for a period (COMPLETED only). Groups line items by SKU
// since there's no product-name field; SKU is the product identifier.
export type TopProductRow = {
  sku: string;
  units: number;
  revenue: number;
};

export async function getTopProducts(
  start: Date,
  end: Date,
  limit = 5
): Promise<TopProductRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      inv.sku                   AS "sku",
      COUNT(it.id)              AS "units",
      COALESCE(SUM(it.price),0) AS "revenue"
    FROM items it
    JOIN invoices inv ON inv.id = it."invoiceId"
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = 'COMPLETED'
    GROUP BY inv.sku
    ORDER BY "revenue" DESC
    LIMIT ${limit}
  `;
  return rows.map((r: any) => ({
    sku: r.sku,
    units: n(r.units),
    revenue: n(r.revenue),
  }));
}

export async function getSummary(start: Date, end: Date): Promise<Summary> {
  // Subtotal = SUM of item prices on COMPLETED invoices. Joins items, so this
  // is the ONLY place we sum item money for COMPLETED.
  const money = await prisma.$queryRaw<any[]>`
    SELECT COALESCE(SUM(it.price), 0) AS "subtotalTotal"
    FROM items it
    JOIN invoices inv ON inv.id = it."invoiceId"
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = 'COMPLETED'
  `;
  // Invoice-level fields: NO items join, so count and freebies aren't
  // multiplied by the number of items per invoice.
  const invMeta = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*)                  AS "invoiceCount",
      COALESCE(SUM(freebies),0) AS "freebiesTotal"
    FROM invoices
    WHERE "dateIssued" >= ${start} AND "dateIssued" < ${end}
      AND status = 'COMPLETED'
  `;
  // JOYJOY / RTS lines: SUM of item prices, filtered by invoice status.
  const statusMoney = await prisma.$queryRaw<any[]>`
    SELECT
      COALESCE(SUM(it.price) FILTER (WHERE inv.status = 'JOYJOY'), 0) AS "joyjoyAmount",
      COALESCE(SUM(it.price) FILTER (WHERE inv.status = 'RTS'), 0)    AS "rtsTotal"
    FROM invoices inv
    LEFT JOIN items it ON it."invoiceId" = inv.id
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
  `;
  const items = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) AS "itemCount"
    FROM items it
    JOIN invoices inv ON inv.id = it."invoiceId"
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = 'COMPLETED'
  `;
  const m = money[0] ?? {};
  const meta = invMeta[0] ?? {};
  const sm = statusMoney[0] ?? {};
  return {
    invoiceCount: n(meta.invoiceCount),
    itemCount: n(items[0]?.itemCount),
    subtotalTotal: n(m.subtotalTotal),
    freebiesTotal: n(meta.freebiesTotal),
    joyjoyAmount: n(sm.joyjoyAmount),
    rtsTotal: n(sm.rtsTotal),
  };
}

export async function getBySeller(start: Date, end: Date): Promise<SellerRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      u.id                      AS "sellerId",
      u.name                    AS "sellerName",
      COUNT(DISTINCT inv.id)    AS "invoiceCount",
      COUNT(it.id)              AS "itemCount",
      COALESCE(SUM(it.price),0) AS "subtotal"
    FROM invoices inv
    JOIN users u ON u.id = inv."sellerId"
    LEFT JOIN items it ON it."invoiceId" = inv.id AND it.status = 'COMPLETED'
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = 'COMPLETED'
    GROUP BY u.id, u.name
    ORDER BY "subtotal" DESC
  `;
  return rows.map((r: any) => ({
    sellerId: r.sellerId,
    sellerName: r.sellerName,
    invoiceCount: n(r.invoiceCount),
    itemCount: n(r.itemCount),
    subtotal: n(r.subtotal),
  }));
}

export async function getByPlatform(start: Date, end: Date): Promise<PlatformRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      p.id                      AS "platformId",
      p.name                    AS "platformName",
      COUNT(DISTINCT inv.id)    AS "invoiceCount",
      COALESCE(SUM(it.price),0) AS "subtotal"
    FROM invoices inv
    JOIN platforms p ON p.id = inv."platformId"
    LEFT JOIN items it ON it."invoiceId" = inv.id
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = 'COMPLETED'
    GROUP BY p.id, p.name
    ORDER BY "subtotal" DESC
  `;
  return rows.map((r: any) => ({
    platformId: r.platformId,
    platformName: r.platformName,
    invoiceCount: n(r.invoiceCount),
    subtotal: n(r.subtotal),
  }));
}

export async function getByCategory(start: Date, end: Date): Promise<CategoryRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      c.id                     AS "categoryId",
      c.name                   AS "categoryName",
      COUNT(it.id)             AS "itemCount",
      COALESCE(SUM(it.price),0) AS "subtotal"
    FROM items it
    JOIN invoices inv ON inv.id = it."invoiceId"
    JOIN "item-categories" c ON c.id = it."categoryId"
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = 'COMPLETED'
    GROUP BY c.id, c.name
    ORDER BY "subtotal" DESC
  `;
  return rows.map((r: any) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    itemCount: n(r.itemCount),
    subtotal: n(r.subtotal),
  }));
}

export async function getLineItems(start: Date, end: Date): Promise<LineItem[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      inv.id            AS "invoiceId",
      inv.sku           AS "sku",
      inv."dateIssued"  AS "dateIssued",
      u.name            AS "sellerName",
      cust.name         AS "customerName",
      p.name            AS "platformName",
      c.name            AS "categoryName",
      it.price          AS "itemPrice",
      it.status         AS "itemStatus"
    FROM items it
    JOIN invoices inv ON inv.id = it."invoiceId"
    JOIN users u       ON u.id = inv."sellerId"
    JOIN customers cust ON cust.id = inv."customerId"
    JOIN platforms p   ON p.id = inv."platformId"
    JOIN "item-categories" c ON c.id = it."categoryId"
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
    ORDER BY inv."dateIssued" ASC
  `;
  return rows.map((r: any) => ({
    invoiceId: r.invoiceId,
    sku: r.sku,
    dateIssued: r.dateIssued,
    sellerName: r.sellerName,
    customerName: r.customerName,
    platformName: r.platformName,
    categoryName: r.categoryName,
    itemPrice: n(r.itemPrice),
    itemStatus: r.itemStatus,
  }));
}

// One row per day (all sellers combined). All money on SUM(it.price).
export async function getByDate(start: Date, end: Date): Promise<DateRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    WITH inv_money AS (
      SELECT
        to_char((inv."dateIssued" AT TIME ZONE 'Asia/Manila'), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(it.price), 0) AS subtotal_all,
        COALESCE(SUM(it.price) FILTER (WHERE inv.status = 'JOYJOY'), 0) AS joyjoy_amount,
        COUNT(it.id) FILTER (WHERE inv.status = 'JOYJOY') AS joyjoy_qty
      FROM invoices inv
      LEFT JOIN items it ON it."invoiceId" = inv.id
      WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      GROUP BY day
    )
    SELECT
      day                     AS "day",
      subtotal_all            AS "subtotalAll",
      joyjoy_amount           AS "joyjoyAmount",
      COALESCE(joyjoy_qty, 0) AS "joyjoyQuantity"
    FROM inv_money
    ORDER BY day ASC
  `;
  return rows.map((r: any) => ({
    day: r.day,
    subtotalAll: n(r.subtotalAll),
    joyjoyAmount: n(r.joyjoyAmount),
    joyjoyQuantity: n(r.joyjoyQuantity),
  }));
}

// One row per invoice for a given status ('JOYJOY' or 'RTS').
// subtotal = SUM of that invoice's item prices.
export async function getInvoicesByStatus(
  start: Date,
  end: Date,
  status: "JOYJOY" | "RTS"
): Promise<StatusInvoiceRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      inv.id           AS "invoiceId",
      inv.sku          AS "sku",
      inv."dateIssued" AS "dateIssued",
      u.name           AS "sellerName",
      cust.name        AS "customerName",
      p.name           AS "platformName",
      COUNT(it.id)     AS "itemCount",
      COALESCE(SUM(it.price), 0) AS "subtotal"
    FROM invoices inv
    JOIN users u        ON u.id = inv."sellerId"
    JOIN customers cust ON cust.id = inv."customerId"
    JOIN platforms p    ON p.id = inv."platformId"
    LEFT JOIN items it  ON it."invoiceId" = inv.id
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = ${status}::"InvoiceStatus"
    GROUP BY inv.id, inv.sku, inv."dateIssued", u.name, cust.name, p.name
    ORDER BY inv."dateIssued" ASC
  `;
  return rows.map((r: any) => ({
    invoiceId: r.invoiceId,
    sku: r.sku,
    dateIssued: r.dateIssued,
    sellerName: r.sellerName,
    customerName: r.customerName,
    platformName: r.platformName,
    subtotal: n(r.subtotal),
    itemCount: n(r.itemCount),
  }));
}

export async function getFullReport(start: Date, end: Date) {
  const [
    summary,
    bySeller,
    byPlatform,
    byCategory,
    lineItems,
    byDate,
    joyjoyInvoices,
    rtsInvoices,
  ] = await Promise.all([
    getSummary(start, end),
    getBySeller(start, end),
    getByPlatform(start, end),
    getByCategory(start, end),
    getLineItems(start, end),
    getByDate(start, end),
    getInvoicesByStatus(start, end, "JOYJOY"),
    getInvoicesByStatus(start, end, "RTS"),
  ]);
  return {
    summary,
    bySeller,
    byPlatform,
    byCategory,
    lineItems,
    byDate,
    joyjoyInvoices,
    rtsInvoices,
  };
}

export type DailyPoint = { day: string; revenue: number; orders: number };

export async function getDailyPoints(
  start: Date,
  end: Date
): Promise<DailyPoint[]> {
  const rows = await prisma.$queryRaw<any[]>`
    WITH per_invoice AS (
      SELECT
        inv.id,
        to_char((inv."dateIssued" AT TIME ZONE 'Asia/Manila'), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(it.price), 0) AS inv_total
      FROM invoices inv
      LEFT JOIN items it ON it."invoiceId" = inv.id
      WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
        AND inv.status = 'COMPLETED'
      GROUP BY inv.id, day
    )
    SELECT
      day               AS "day",
      COALESCE(SUM(inv_total), 0) AS "revenue",
      COUNT(*)          AS "orders"
    FROM per_invoice
    GROUP BY day
    ORDER BY day ASC
  `;
  return rows.map((r: any) => ({
    day: r.day,
    revenue: n(r.revenue),
    orders: n(r.orders),
  }));
}