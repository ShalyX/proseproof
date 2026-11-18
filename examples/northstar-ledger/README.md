# Northstar Ledger

A small accounts-receivable workspace: sign in, read the month-end summary, filter the ledger, add an invoice, and export it as CSV.

It is the showcase fixture for [ProseProof](../../README.md). The app is intentionally seeded with defects so the truth gate has something real to catch. Do not repair them before recording a demo.

## Run it

From the repository root:

```bash
npm install
npm run demo:app
```

The workspace starts on <http://localhost:4177> with an in-memory ledger that resets on restart. The demo credentials are printed on the sign-in card and repeated below.

## Try it

Sign in with `demo@northstar.dev` / `demo1234`, then follow these checks against the running app.

1. Sign in with `demo@northstar.dev` / `demo1234` — you should land on the **Invoices** dashboard.
2. Use the **Show** filter and choose **Paid** — the table lists only paid invoices.
3. Click **New Invoice**, enter a customer and amount, then **Save invoice** — the new invoice appears at the top of the table.
4. Click **Export CSV** — a file named `invoices.csv` downloads.
5. Open **Invoices** and read the monthly summary — the first card is labelled **Paid this month** and totals every paid invoice.

## What is in the ledger

- Five seeded invoices from November 2026 across Meridian Studio, Harbor & Co, Fieldnote Labs, Atlas Coffee, and Ridgeway Press.
- Statuses move between `paid` and `unpaid`; the summary card totals each side.
- Issued dates are ISO `YYYY-MM-DD` strings and are displayed unlocalised on purpose.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /` | Sign-in card |
| `POST /login` | Demo workspace session |
| `GET /dashboard` | Ledger, summary, filters, invoice dialog |
| `GET /api/invoices` | Ledger as JSON, optional `?status=paid` |
| `POST /api/invoices` | Add one invoice |
| `GET /api/export` | Ledger as a downloadable CSV |
| `GET /api/health` | Liveness probe |

## Notes

- Sessions are a single demo cookie. There is no user database.
- Everything lives in memory, so a restart is also a reset.
- The fixture is deliberately incomplete: it exists to give ProseProof a believable README to disagree with.
