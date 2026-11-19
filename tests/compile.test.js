import test from 'node:test';
import assert from 'node:assert/strict';
import { compileClaim, POLICY_YAML } from '../src/compiler/compile.js';

const setup = { credentials: { email: 'demo@northstar.dev', password: 'demo1234' } };
const url = 'http://localhost:4177';

function claim(overrides = {}) {
  return {
    id: 'N-04',
    title: 'Click Export CSV',
    quote: 'Click **Export CSV** — a file named `invoices.csv` downloads.',
    text: 'Click Export CSV — a file named invoices.csv downloads.',
    action: 'Click Export CSV',
    expectation: 'a file named invoices.csv downloads',
    rawAction: 'Click **Export CSV**',
    rawExpectation: 'a file named `invoices.csv` downloads',
    citation: { file: 'README.md', path: 'README.md', line: 25 },
    location: 'README.md:25',
    ...overrides,
  };
}

test('signs in first, then asserts the quoted outcome', () => {
  const md = compileClaim(claim(), { setup, url });
  assert.match(md, /^---\nmode: testing\nurl: http:\/\/localhost:4177/m);
  assert.match(md, /## Sign in/);
  assert.match(md, /demo@northstar\.dev/);
  assert.match(md, /click "Export CSV", then verify a file named "invoices\.csv" downloads\./);
  assert.match(md, /proseproof:claim=N-04 source=README\.md:25/);
});

test('a sign-in claim signs in through its own action', () => {
  const md = compileClaim(
    claim({
      id: 'N-01',
      title: 'Sign in',
      text: 'Sign in with demo@northstar.dev / demo1234 — you are on the Invoices dashboard',
      action: 'Sign in with demo@northstar.dev / demo1234',
      expectation: 'you are on the Invoices dashboard',
      rawAction: 'Sign in with `demo@northstar.dev` / `demo1234`',
      rawExpectation: 'you are on the **Invoices** dashboard',
    }),
    { setup, url },
  );
  assert.equal((md.match(/## Sign in/g) || []).length, 1);
  assert.match(md, /sign in with "demo@northstar\.dev" \/ "demo1234"/);
  assert.match(md, /verify you are on the "Invoices" dashboard/);
});

test('a universal promise asks the authoring agent to check every row', () => {
  const md = compileClaim(
    claim({
      id: 'N-02',
      title: 'Use the Show filter and choose Paid',
      text: 'Use the Show filter and choose Paid — the table lists only paid invoices.',
      action: 'Use the Show filter and choose Paid',
      expectation: 'the table lists only paid invoices',
      rawAction: 'Use the **Show** filter and choose **Paid**',
      rawExpectation: 'the table lists only paid invoices',
      location: 'README.md:23',
    }),
    { setup, url },
  );
  assert.match(md, /verify the table lists only paid invoices\. Check every visible row rather than a sample\./);
});

test('policy gates the run on zero failures and real assertions', () => {
  assert.match(POLICY_YAML, /metric: totals\.failed/);
  assert.match(POLICY_YAML, /metric: pass_rate/);
  assert.match(POLICY_YAML, /metric: metrics\.tests_without_checks/);
  assert.match(POLICY_YAML, /severity: blocking/);
});
