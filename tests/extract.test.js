import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractClaims, speakMarkdown } from '../src/extractor/extract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.readFileSync(path.join(root, 'examples/northstar-ledger/README.md'), 'utf8');

test('extracts the documented walkthrough promises with citations', () => {
  const { claims, setup } = extractClaims({
    docs: [{ path: path.join(root, 'examples/northstar-ledger/README.md'), content: fixture }],
    baseUrl: 'http://localhost:4177',
  });

  assert.equal(claims.length, 5);
  assert.deepEqual(claims.map((claim) => claim.id), ['N-01', 'N-02', 'N-03', 'N-04', 'N-05']);
  assert.equal(claims[0].title, 'Sign in');
  assert.equal(claims[0].citation.file, 'README.md');
  assert.ok(claims[0].citation.line > 0);
  assert.equal(setup.credentials.email, 'demo@northstar.dev');
  assert.equal(setup.credentials.password, 'demo1234');
  assert.equal(setup.baseUrl, 'http://localhost:4177');
});

test('keeps the promised label inside the expectation', () => {
  const { claims } = extractClaims({ docs: [{ path: 'README.md', content: fixture }] });
  const drift = claims.find((claim) => claim.id === 'N-05');
  assert.match(drift.expectation, /Paid this month/);
});

test('drops shell-only and non-verifiable instructions', () => {
  const doc = [
    '## Try it',
    '',
    '- `npm install`',
    '- Run the server on port 3000.',
    '- Open the **Settings** page.',
    '- Click **Save** and verify the banner **Saved** appears.',
  ].join('\n');
  const { claims, warnings } = extractClaims({ docs: [{ path: 'README.md', content: doc }] });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].text.includes('npm install'), false);
  assert.equal(warnings.length, 1);
});

test('speakMarkdown quotes labels instead of stripping them', () => {
  assert.equal(
    speakMarkdown('the first card is labelled **Paid this month**'),
    'the first card is labelled "Paid this month"',
  );
  assert.equal(speakMarkdown('a file named `invoices.csv` downloads'), 'a file named "invoices.csv" downloads');
});
