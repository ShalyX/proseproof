import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4177);

const seed = [
  { number: 1041, customer: 'Meridian Studio', amount: 2400, status: 'paid', issued: '2026-11-02' },
  { number: 1042, customer: 'Harbor & Co', amount: 1850, status: 'unpaid', issued: '2026-11-05' },
  { number: 1043, customer: 'Fieldnote Labs', amount: 3200, status: 'paid', issued: '2026-11-08' },
  { number: 1044, customer: 'Atlas Coffee', amount: 640, status: 'unpaid', issued: '2026-11-11' },
  { number: 1045, customer: 'Ridgeway Press', amount: 980, status: 'paid', issued: '2026-11-14' },
];

let invoices = seed.map((invoice) => ({ ...invoice }));
let nextNumber = 1046;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function summary() {
  const paid = invoices.filter((invoice) => invoice.status === 'paid');
  const collected = paid.reduce((total, invoice) => total + invoice.amount, 0);
  const outstanding = invoices
    .filter((invoice) => invoice.status === 'unpaid')
    .reduce((total, invoice) => total + invoice.amount, 0);
  return { collected, outstanding, count: invoices.length, paid: paid.length };
}

function layout(title, body, { signedIn = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Northstar Ledger</title>
<link rel="stylesheet" href="/app.css">
</head>
<body class="${signedIn ? 'is-app' : 'is-gate'}">
${body}
</body>
</html>`;
}

app.get('/', (req, res) => {
  if (req.headers.cookie?.includes('nl_session=demo')) return res.redirect('/dashboard');
  res.send(layout('Sign in', `
  <main class="gate">
    <section class="gate-card">
      <div class="mark">N</div>
      <h1>Northstar Ledger</h1>
      <p class="lede">Invoices, collections, and a clean month-end. Sign in to the demo workspace.</p>
      <form method="post" action="/login" class="stack">
        <label>Email<input name="email" type="email" value="demo@northstar.dev" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" value="demo1234" autocomplete="current-password" required></label>
        <button type="submit" class="btn primary wide">Sign in</button>
      </form>
      <p class="hint">Demo workspace · <code>demo@northstar.dev</code> / <code>demo1234</code></p>
    </section>
    <footer class="gate-foot">Northstar Ledger · showcase fixture for ProseProof</footer>
  </main>`));
});

app.get('/logout', (req, res) => {
  res.setHeader('set-cookie', 'nl_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.redirect('/');
});

app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === 'demo@northstar.dev' && password === 'demo1234') {
    res.setHeader('set-cookie', 'nl_session=demo; Path=/; HttpOnly; SameSite=Lax');
    return res.redirect('/dashboard');
  }
  res.status(401).send(layout('Sign in', `
  <main class="gate">
    <section class="gate-card">
      <div class="mark">N</div>
      <h1>Northstar Ledger</h1>
      <p class="error">That email and password did not match the demo workspace.</p>
      <form method="post" action="/login" class="stack">
        <label>Email<input name="email" type="email" value="demo@northstar.dev" required></label>
        <label>Password<input name="password" type="password" value="" required></label>
        <button type="submit" class="btn primary wide">Sign in</button>
      </form>
    </section>
  </main>`));
});

app.get('/dashboard', (req, res) => {
  if (!req.headers.cookie?.includes('nl_session=demo')) return res.redirect('/');
  const totals = summary();
  res.send(layout('Invoices', `
  <header class="appbar">
    <div class="appbar-left">
      <span class="mark small">N</span>
      <span class="wordmark">Northstar Ledger</span>
      <span class="pill">Demo workspace</span>
    </div>
    <div class="appbar-right">
      <span class="who">demo@northstar.dev</span>
      <a class="btn ghost" href="/logout">Sign out</a>
    </div>
  </header>

  <main class="workspace">
    <div class="page-head">
      <div>
        <p class="eyebrow">November 2026</p>
        <h1>Invoices</h1>
      </div>
      <div class="actions">
        <button class="btn" id="export">Export CSV</button>
        <button class="btn primary" id="new-invoice">New Invoice</button>
      </div>
    </div>

    <p class="export-status" id="export-status" role="status" hidden></p>

    <section class="summary" aria-label="Monthly summary">
      <article class="card accent">
        <p class="card-label">Collected this month</p>
        <p class="card-value">${money(totals.collected)}</p>
        <p class="card-note">${totals.paid} paid invoices</p>
      </article>
      <article class="card">
        <p class="card-label">Outstanding</p>
        <p class="card-value">${money(totals.outstanding)}</p>
        <p class="card-note">${invoices.length - totals.paid} awaiting payment</p>
      </article>
      <article class="card">
        <p class="card-label">Invoices</p>
        <p class="card-value">${totals.count}</p>
        <p class="card-note">this month</p>
      </article>
    </section>

    <section class="table-wrap">
      <div class="table-head">
        <h2>All invoices</h2>
        <label class="filter">Show
          <select id="filter">
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </label>
      </div>
      <table id="invoices">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Status</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${invoices.map((invoice) => `
          <tr data-status="${invoice.status}">
            <td class="mono">INV-${invoice.number}</td>
            <td>${invoice.customer}</td>
            <td class="muted">${invoice.issued}</td>
            <td><span class="status ${invoice.status}">${invoice.status === 'paid' ? 'Paid' : 'Unpaid'}</span></td>
            <td class="right mono">${money(invoice.amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="empty" id="empty" hidden>No invoices match this filter.</p>
    </section>
  </main>

  <dialog id="dialog">
    <form method="dialog" id="invoice-form">
      <h2>New invoice</h2>
      <label>Customer<input name="customer" required placeholder="Beacon Supply"></label>
      <label>Amount<input name="amount" type="number" min="1" step="1" required placeholder="1200"></label>
      <label>Status
        <select name="status"><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select>
      </label>
      <div class="dialog-actions">
        <button type="button" class="btn ghost" id="cancel">Cancel</button>
        <button type="submit" class="btn primary">Save invoice</button>
      </div>
    </form>
  </dialog>

  <script src="/app.js"></script>`, { signedIn: true }));
});

app.get('/api/invoices', (req, res) => {
  const status = req.query.status;
  const rows = status && status !== 'all' ? invoices.filter((invoice) => invoice.status === status) : invoices;
  res.json({ invoices: rows, summary: summary() });
});

app.post('/api/invoices', (req, res) => {
  const { customer, amount, status } = req.body || {};
  if (!customer || !amount) return res.status(400).json({ error: 'customer and amount are required' });
  const invoice = {
    number: nextNumber++,
    customer: String(customer),
    amount: Number(amount),
    status: status === 'paid' ? 'paid' : 'unpaid',
    issued: new Date().toISOString().slice(0, 10),
  };
  invoices = [invoice, ...invoices];
  res.status(201).json({ invoice, summary: summary() });
});

function toCsv(rows) {
  const header = 'number,customer,amount,status,issued';
  // Invoice numbers are zero-padded identifiers in the exported ledger.
  const lines = rows.map((invoice) => [
    invoice.number.padStart(6, '0'),
    invoice.customer,
    invoice.amount.toFixed(2),
    invoice.status,
    invoice.issued,
  ].join(','));
  return [header, ...lines].join('\n') + '\n';
}

app.get('/api/export', (req, res) => {
  const csv = toCsv(invoices);
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="invoices.csv"');
  res.send(csv);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'northstar-ledger', invoices: invoices.length });
});

app.get('/reports', (req, res) => {
  res.redirect('/dashboard');
});

app.listen(PORT, () => {
  console.log(`Northstar Ledger listening on http://localhost:${PORT}`);
});
