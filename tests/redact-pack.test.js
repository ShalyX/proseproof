import test from 'node:test';
import assert from 'node:assert/strict';
import { redactPack } from '../src/redact/redact.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fixturePack() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proseproof-pack-'));
  const pack = path.join(root, 'pack');
  const testDir = path.join(pack, 'tests', 'n-01-sign-in-abc');
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(path.join(testDir, 'test.md'), '# N-01\nSign in with "demo@northstar.dev".\n');
  fs.writeFileSync(
    path.join(testDir, 'result.yaml'),
    [
      'evidence: "0.1"',
      'test: n-01-sign-in-abc',
      'status: passed',
      'definition:',
      '  path: test.md',
      '  sha256: sha256:0000',
      'user_name: shallomalabi89',
      '',
    ].join('\n'),
  );
  return { root, pack };
}

test('redaction leaves demo credentials in a test definition intact', async () => {
  const { root, pack } = fixturePack();
  const out = path.join(root, 'redacted.evidence');
  await redactPack({
    packPath: pack,
    outPath: out,
    rootDir: root,
    workDir: path.join(root, 'work'),
    literals: [],
    validate: false,
  });
  // Inspect the repacked zip's definition through the same unzip helper used in production.
  const { unzipTo } = await import('../src/evidence/pack.js');
  const unpacked = path.join(root, 'unpacked');
  await unzipTo(out, unpacked);
  const testFile = path.join(unpacked, 'tests', 'n-01-sign-in-abc', 'test.md');
  assert.match(fs.readFileSync(testFile, 'utf8'), /demo@northstar\.dev/);
  const result = fs.readFileSync(path.join(unpacked, 'tests', 'n-01-sign-in-abc', 'result.yaml'), 'utf8');
  assert.equal(result.includes('shallomalabi89'), false);
  assert.equal(result.includes('sha256:0000'), false);
  assert.match(result, /sha256: sha256:[a-f0-9]{64}/);
});
