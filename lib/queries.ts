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

export type SellerJoyjoyRow = {
  sellerId: string;
  joyjoyAmount: number; // SUM item.price where invoice status = JOYJOY, per seller
};

// JOYJOY money by seller. Separate from getBySeller because that query's
// WHERE/JOIN are scoped to COMPLETED invoices; JOYJOY is a different invoice
// status entirely, so it needs its own unrestricted join per the FAN-OUT RULE.
export async function getBySellerJoyjoy(
  start: Date,
  end: Date
): Promise<SellerJoyjoyRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      u.id                       AS "sellerId",
      COALESCE(SUM(it.price), 0) AS "joyjoyAmount"
    FROM invoices inv
    JOIN users u ON u.id = inv."sellerId"
    LEFT JOIN items it ON it."invoiceId" = inv.id
    WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
      AND inv.status = 'JOYJOY'
    GROUP BY u.id
  `;
  return rows.map((r: any) => ({
    sellerId: r.sellerId,
    joyjoyAmount: n(r.joyjoyAmount),
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

export type DailyPoint = {
  day: string;
  revenue: number;
  orders: number;
  unitsSold: number;    // items on COMPLETED invoices that day
  joyjoyAmount: number; // SUM item.price where invoice status = JOYJOY that day
};

export async function getDailyPoints(
  start: Date,
  end: Date
): Promise<DailyPoint[]> {
  const rows = await prisma.$queryRaw<any[]>`
    WITH per_invoice AS (
      SELECT
        inv.id,
        to_char((inv."dateIssued" AT TIME ZONE 'Asia/Manila'), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(it.price), 0) AS inv_total,
        COUNT(it.id) AS item_count
      FROM invoices inv
      LEFT JOIN items it ON it."invoiceId" = inv.id
      WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
        AND inv.status = 'COMPLETED'
      GROUP BY inv.id, day
    ),
    per_day AS (
      SELECT
        day,
        COALESCE(SUM(inv_total), 0) AS revenue,
        COUNT(*)                    AS orders,
        COALESCE(SUM(item_count), 0) AS units_sold
      FROM per_invoice
      GROUP BY day
    ),
    joyjoy_per_day AS (
      SELECT
        to_char((inv."dateIssued" AT TIME ZONE 'Asia/Manila'), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(it.price), 0) AS joyjoy_amount
      FROM invoices inv
      LEFT JOIN items it ON it."invoiceId" = inv.id
      WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
        AND inv.status = 'JOYJOY'
      GROUP BY day
    )
    SELECT
      COALESCE(pd.day, jj.day)          AS "day",
      COALESCE(pd.revenue, 0)           AS "revenue",
      COALESCE(pd.orders, 0)            AS "orders",
      COALESCE(pd.units_sold, 0)        AS "unitsSold",
      COALESCE(jj.joyjoy_amount, 0)     AS "joyjoyAmount"
    FROM per_day pd
    FULL JOIN joyjoy_per_day jj ON jj.day = pd.day
    ORDER BY "day" ASC
  `;
  return rows.map((r: any) => ({
    day: r.day,
    revenue: n(r.revenue),
    orders: n(r.orders),
    unitsSold: n(r.unitsSold),
    joyjoyAmount: n(r.joyjoyAmount),
  }));
}

// ---------------------------------------------------------------------------
// Invoice activity by fixed time block + day-of-week. This intentionally
// does NOT use the `shifts` table -- shift scheduling isn't wired into the
// live logic yet, so instead of joining to actual shift rows, each COMPLETED
// invoice is classified into a block purely from its own dateIssued hour,
// and revenue/orders/units are grouped by (day-of-week, block). Distinct
// seller count / names are included as a rough "who was working" proxy,
// since without real shift durations there's no way to compute a
// revenue-per-hour rate -- only revenue-per-block totals.
//
// TIMEZONE: "dateIssued" is stored as a UTC wall-clock value with no offset
// attached. Bucketing by Manila calendar day / hour requires a DOUBLE
// "AT TIME ZONE": dateIssued AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'.
// The first AT TIME ZONE anchors the naive value as UTC (-> timestamptz, the
// correct absolute instant). The second converts that instant to Manila wall
// time (-> naive timestamp again, but now numerically correct for Manila).
// A SINGLE "AT TIME ZONE 'Asia/Manila'" on a naive column is WRONG: Postgres
// instead treats the naive value as if it were already Manila local time and
// shifts it the wrong way, silently producing hours/days off by up to 16
// hours.
//
// Time blocks are fixed by business hours:
//   Morning:   5:00am - 10:00am  (hour in [5, 11))
//   Afternoon: 11:00am - 5:00pm  (hour in [11, 18))
//   Evening:   6:00pm  - 12:00am (hour in [18, 24) or [0, 5))
//
// MIDNIGHT ROLLOVER: a sale between 12:00am-4:59am is the tail end of the
// PREVIOUS calendar day's Evening session spilling past midnight -- there is
// no shift scheduled for that window on its own. So the day-of-week used for
// grouping is anchored back by one day whenever hour < 5, even though the
// block is still 'Evening'. Example: a sale at 2026-07-27 00:09am Manila
// (technically Monday) groups under Sunday/Evening, not Monday/Evening,
// since it's really Sunday night's session, not a Monday one.
//
// CAVEATS:
// - This is activity-by-time-of-day, not shift performance. It answers "when
//   does revenue happen" and "who's usually invoicing then," not "was this
//   scheduled shift profitable" -- that needs real shift data once it exists.
// - "unitsSold" here counts items on COMPLETED invoices only, consistent
//   with the MONEY POLICY at the top of this file.
// - Read-only: only SELECTs from invoices/items. Nothing here writes to the
//   database.
export type TimeBlock = "Morning" | "Afternoon" | "Evening";

export type InvoiceBlockRow = {
  dayOfWeek: number;   // 0=Sun..6=Sat (Postgres EXTRACT(DOW) convention)
  block: TimeBlock;
  sellerCount: number; // distinct sellers who invoiced in this day+block
  sellerNames: string[]; // distinct seller names, alphabetical
  orders: number;
  unitsSold: number;
  revenue: number;
};

export async function getInvoiceActivityByBlock(
  start: Date,
  end: Date
): Promise<InvoiceBlockRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    WITH invoice_time AS (
      SELECT
        inv.id                                                              AS "invoiceId",
        inv."sellerId",
        u.name                                                              AS "sellerName",
        (inv."dateIssued" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')    AS manila_ts,
        EXTRACT(HOUR FROM (inv."dateIssued" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'))::int AS hour
      FROM invoices inv
      JOIN users u ON u.id = inv."sellerId"
      WHERE inv."dateIssued" >= ${start} AND inv."dateIssued" < ${end}
        AND inv.status = 'COMPLETED'
    ),
    invoice_blocked AS (
      SELECT
        "invoiceId", "sellerId", "sellerName",
        -- Shifts only cover 5am-12am; a sale between 12am-5am is the tail
        -- end of the PREVIOUS day's Evening session rolling past midnight,
        -- not the start of today. Anchor the business day back by one when
        -- hour < 5 so it groups with the session it actually belongs to.
        EXTRACT(DOW FROM (CASE WHEN hour < 5 THEN manila_ts - INTERVAL '1 day' ELSE manila_ts END))::int AS dow,
        CASE
          WHEN hour >= 5  AND hour < 11 THEN 'Morning'
          WHEN hour >= 11 AND hour < 18 THEN 'Afternoon'
          ELSE 'Evening'
        END AS block
      FROM invoice_time
    )
    SELECT
      ib.dow                                              AS "dayOfWeek",
      ib.block                                             AS "block",
      COUNT(DISTINCT ib."sellerId")                        AS "sellerCount",
      ARRAY_AGG(DISTINCT ib."sellerName" ORDER BY ib."sellerName") AS "sellerNames",
      COUNT(DISTINCT ib."invoiceId")                       AS "orders",
      COUNT(it.id)                                         AS "unitsSold",
      COALESCE(SUM(it.price), 0)                           AS "revenue"
    FROM invoice_blocked ib
    LEFT JOIN items it ON it."invoiceId" = ib."invoiceId"
    GROUP BY ib.dow, ib.block
    ORDER BY ib.dow,
      CASE ib.block WHEN 'Morning' THEN 1 WHEN 'Afternoon' THEN 2 ELSE 3 END
  `;
  return rows.map((r: any) => ({
    dayOfWeek: n(r.dayOfWeek),
    block: r.block as TimeBlock,
    sellerCount: n(r.sellerCount),
    sellerNames: Array.isArray(r.sellerNames) ? r.sellerNames : [],
    orders: n(r.orders),
    unitsSold: n(r.unitsSold),
    revenue: n(r.revenue),
  }));
}