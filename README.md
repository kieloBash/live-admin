# Live Admin Analytics

Read-only admin reporting app for the live-selling business. Reads directly from
the existing Supabase Postgres database and produces multi-tab Excel reports and
a daily summary email. It never writes to the database.

## Money policy

All monetary "subtotal" figures are computed as the **sum of item prices**
(`items.price`) for the invoices in scope. The stored invoice `subTotal`,
`grandTotal`, and `tax` fields are intentionally ignored everywhere. Reports are
`COMPLETED`-only unless otherwise noted; `JOYJOY` and `RTS` statuses are reported
on their own tabs and summary lines.

## Environment variables

Set these in `.env.local` for local development and in the Vercel dashboard for
production.

```
DATABASE_URL           # Supabase connection string (see notes below)
GMAIL_USER             # sending Gmail address
GOOGLE_CLIENT_ID       # Gmail OAuth2 client ID
GOOGLE_CLIENT_SECRET   # Gmail OAuth2 client secret
GOOGLE_REFRESH_TOKEN   # refresh token with the gmail.send scope
REPORT_RECIPIENTS      # comma-separated list, e.g. a@x.com,b@y.com
CRON_SECRET            # long random string protecting the cron endpoint
```

Connection string notes:

- **App runtime / deploy:** use the Supabase **transaction pooler** (port 6543).
- **`prisma db pull` only:** use the **session pooler** (port 5432). The direct
  `db.<ref>.supabase.co` host is IPv6-only and usually unreachable locally.

## Setup

```bash
npm install
npx prisma db pull      # introspect the existing DB (read-only)
npx prisma generate
npm run dev
```

## API endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET  | `/api/reports/daily`    | Sales for one day (defaults to yesterday). `format=json\|xlsx` |
| GET  | `/api/reports/range`    | Sales across a date range. `format=json\|xlsx` |
| POST | `/api/reports/generate` | Generate for a day or range; download or email |
| POST | `/api/reports/email`    | Build a report for a date and email it now |
| GET/POST | `/api/cron/daily-report` | Daily summary email + Excel (secret-protected) |

The Excel workbook contains: Summary, By Date, Per Seller, Per Platform,
Per Category, JoyJoy, RTS, and Line Items tabs.

## Usage (curl)

Replace `http://localhost:3000` with your deployed URL (e.g.
`https://your-app.vercel.app`) when running against production. Replace
`test123` with your actual `CRON_SECRET`.

### Daily report (single day)

JSON to the terminal:

```bash
curl "http://localhost:3000/api/reports/daily?date=2026-07-20"
```

Download the Excel:

```bash
curl "http://localhost:3000/api/reports/daily?date=2026-07-20&format=xlsx" -o report-2026-07-20.xlsx
```

Defaults to yesterday if the date is omitted:

```bash
curl "http://localhost:3000/api/reports/daily"
```

### Date range

JSON:

```bash
curl "http://localhost:3000/api/reports/range?start=2026-07-01&end=2026-07-31"
```

Download the Excel (end date is inclusive):

```bash
curl "http://localhost:3000/api/reports/range?start=2026-07-01&end=2026-07-31&format=xlsx" -o report-july.xlsx
```

### Generate (download or email)

Single day, download:

```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-07-20"}' \
  -o report.xlsx
```

Range, download:

```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"start":"2026-07-01","end":"2026-07-31"}' \
  -o report-july.xlsx
```

Email instead of downloading (`"email":true`, and drop `-o`):

```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-07-20","email":true}'
```

### Manual email for a date

```bash
curl -X POST http://localhost:3000/api/reports/email \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-07-20"}'
```

Override recipients:

```bash
curl -X POST http://localhost:3000/api/reports/email \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-07-20","to":["boss@example.com"]}'
```

### Cron daily-report (summary email + Excel)

Secret as a query parameter (GET):

```bash
curl "http://localhost:3000/api/cron/daily-report?secret=test123"
```

Bearer header (how Vercel calls it in production, POST):

```bash
curl -X POST http://localhost:3000/api/cron/daily-report \
  -H "Authorization: Bearer test123"
```

Target a specific day (requires the optional `date` override in the route):

```bash
curl "http://localhost:3000/api/cron/daily-report?secret=test123&date=2026-07-20"
```

## Scheduling (Vercel cron)

`vercel.json` registers the daily job:

```json
{
  "crons": [
    { "path": "/api/cron/daily-report", "schedule": "0 22 * * *" }
  ]
}
```

`0 22 * * *` is 22:00 UTC = 6:00 AM Manila (the previous sales day is closed by
then). Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on the
scheduled call, which the route verifies.

## Notes

- Reports return `format=json` by default; add `&format=xlsx` for the file.
- The email/cron routes respond with `{"ok":true,...}`; confirm delivery in the
  inbox.
- **Performance:** the queries rely on indexes existing on the source DB —
  `items."invoiceId"`, `invoices."dateIssued"`, `invoices."sellerId"`,
  `invoices."platformId"`, and `invoices.status`. Without them, reports run slow
  and can exceed Vercel's function timeout.