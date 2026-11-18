import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireRunLock } from '../src/util/fsx.js';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'proseproof-lock-'));
}

test('a second run cannot start while the first holds the lock', () => {
  const root = tempRoot();
  const release = acquireRunLock(root, { command: 'check' });
  assert.throws(() => acquireRunLock(root, { command: 'check' }), /already in progress/);
  release();
  const again = acquireRunLock(root, { command: 'heal' });
  again();
  assert.equal(fs.existsSync(path.join(root, '.proseproof', 'run.lock')), false);
});

test('a lock left by a dead process is reclaimed', () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, '.proseproof'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.proseproof', 'run.lock'),
    JSON.stringify({ pid: 999999, command: 'check', startedAt: '2026-01-01T00:00:00Z' }),
  );
  const release = acquireRunLock(root, { command: 'check' });
  release();
  assert.equal(fs.existsSync(path.join(root, '.proseproof', 'run.lock')), false);
});
