import test from 'node:test';
import assert from 'node:assert/strict';
import { recipePatch } from '../src/healer/agent.js';

const files = [
  {
    path: 'examples/northstar-ledger/README.md',
    content: '5. Read the summary — the first card is labelled **Paid this month** and totals every paid invoice.',
  },
  { path: 'examples/northstar-ledger/server.js', content: 'const label = "Collected this month";' },
];

test('aligns the documented label with the shipped copy', () => {
  const edit = recipePatch({
    claim: {
      id: 'N-05',
      expectation: 'the first card is labelled "Paid this month"',
      rawExpectation: 'the first card is labelled **Paid this month** and totals every paid invoice',
    },
    triage: { classification: 'DOC_DRIFT', observed: 'Collected this month' },
    files,
  });
  assert.ok(edit);
  assert.equal(edit.file, 'examples/northstar-ledger/README.md');
  assert.equal(edit.search, '**Paid this month**');
  assert.equal(edit.replace, '**Collected this month**');
});

test('refuses to invent a repair for an app bug', () => {
  const edit = recipePatch({
    claim: { rawExpectation: 'a file downloads' },
    triage: { classification: 'APP_BUG' },
    files,
  });
  assert.equal(edit, null);
});

test('refuses when the promised label is not a quoted label', () => {
  const edit = recipePatch({
    claim: { rawExpectation: 'the card is labelled paid this month' },
    triage: { classification: 'DOC_DRIFT', observed: 'Collected this month' },
    files,
  });
  assert.equal(edit, null);
});
