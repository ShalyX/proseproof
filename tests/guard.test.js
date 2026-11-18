import test from 'node:test';
import assert from 'node:assert/strict';
import { guardPatch, guardSelfTest } from '../src/guard/anticheat.js';

const before = [
  { id: 'N-01', text: 'Sign in with demo@northstar.dev and land on the invoices dashboard', quote: 'Sign in — you land on **Invoices**.' },
  { id: 'N-02', text: 'Use the show filter and choose paid so the table lists only paid invoices', quote: 'Filter to **Paid**.' },
  { id: 'N-03', text: 'Click export csv and download a file named invoices.csv', quote: 'Click **Export CSV**.' },
];

test('rejects a patch that deletes a promise', () => {
  const result = guardPatch({ before, after: before.slice(0, -1) });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.code === 'CLAIM_REMOVED'));
  assert.ok(result.violations.some((violation) => violation.code === 'CLAIM_COUNT_DROPPED'));
});

test('accepts a repair that keeps every promise', () => {
  const after = before.map((claim) =>
    claim.id === 'N-03'
      ? { ...claim, text: 'Click export csv and download a file named invoices.csv from the ledger', quote: 'Click **Export CSV** and download `invoices.csv`.' }
      : claim,
  );
  const result = guardPatch({ before, after });
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
  assert.equal(result.matches.length, 3);
});

test('rejects hedging that softens a promise', () => {
  const after = before.map((claim) =>
    claim.id === 'N-02'
      ? { ...claim, text: 'Use the show filter and choose paid when possible so the table might list only paid invoices' }
      : claim,
  );
  const result = guardPatch({ before, after });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.code === 'CLAIM_WEAKENED'));
});

test('rejects edits outside the approved scope', () => {
  const result = guardPatch({
    before,
    after: before,
    edits: [{ file: 'src/billing/private.js' }],
    allowedFiles: ['README.md'],
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.code === 'FILE_OUTSIDE_SCOPE'));
});

test('the self-test proves the guard is armed', () => {
  const result = guardSelfTest(before);
  assert.equal(result.rejected, true);
  assert.equal(result.removedClaim, 'N-03');
});
