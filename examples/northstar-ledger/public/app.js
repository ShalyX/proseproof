const filter = document.getElementById('filter');
const table = document.getElementById('invoices');
const empty = document.getElementById('empty');
const dialog = document.getElementById('dialog');
const form = document.getElementById('invoice-form');

function applyFilter() {
  const value = filter.value;
  let visible = 0;
  for (const row of table.querySelectorAll('tbody tr')) {
    const show = value === 'all' || row.dataset.status === value;
    row.hidden = !show;
    if (show) visible += 1;
  }
  empty.hidden = visible > 0;
}

filter?.addEventListener('change', applyFilter);

document.getElementById('new-invoice')?.addEventListener('click', () => {
  form.reset();
  dialog.showModal();
});

document.getElementById('cancel')?.addEventListener('click', () => dialog.close());

document.getElementById('export')?.addEventListener('click', async () => {
  const response = await fetch('/api/export');
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'invoices.csv';
  link.click();
  URL.revokeObjectURL(url);
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch('/api/invoices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) return;
  const payload = await response.json();
  const invoice = payload.invoice;
  const row = document.createElement('tr');
  row.dataset.status = invoice.status;
  row.innerHTML = `
    <td class="mono">INV-${invoice.number}</td>
    <td>${invoice.customer}</td>
    <td class="muted">${invoice.issued}</td>
    <td><span class="status ${invoice.status}">${invoice.status}</span></td>
    <td class="right mono">$${invoice.amount.toFixed(2)}</td>`;
  table.querySelector('tbody').prepend(row);
  dialog.close();
  applyFilter();
});
