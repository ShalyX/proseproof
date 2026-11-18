import test from 'node:test';
import assert from 'node:assert/strict';
import { redactText } from '../src/redact/redact.js';

test('redacts identities and share links from evidence text', () => {
  const input = [
    'user_name: shallomalabi89',
    'user_email: shallomalabi89@gmail.com',
    'sharable_link: https://test-manager.lambdatest.com/t/abc123',
    'org_id: "3437607"',
  ].join('\n');
  const { output, count } = redactText(input);
  assert.equal(count, 4);
  assert.equal(output.includes('shallomalabi89'), false);
  assert.equal(output.includes('abc123'), false);
  assert.match(output, /user_name: redacted/);
  assert.match(output, /org_id: redacted/);
});

test('redacts tokens and explicitly named identities without touching structure', () => {
  const { output } = redactText(
    'authorization: Bearer sk_live_abcdefghijklmnop\ncontact: analyst@northstar.dev',
    ['analyst@northstar.dev'],
  );
  assert.equal(output.includes('sk_live_abcdefghijklmnop'), false);
  assert.equal(output.includes('analyst@northstar.dev'), false);
  assert.match(output, /authorization: Bearer \[redacted-token\]/);
});

test('leaves demo credentials and ordinary evidence alone', () => {
  const input = 'sign in with "demo@northstar.dev" and "demo1234"\nstatus: failed';
  const { output, count } = redactText(input);
  assert.equal(count, 0);
  assert.equal(output, input);
});

test('leaves ordinary evidence alone', () => {
  const input = 'status: failed\nmessage: Final verification failed: "the page shows "Paid this month""';
  const { output, count } = redactText(input);
  assert.equal(count, 0);
  assert.equal(output, input);
});
