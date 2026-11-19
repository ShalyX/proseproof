import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planProject } from '../src/pipeline.js';

const README = `# Northstar Ledger

Sign in with \`demo@northstar.dev\` / \`demo1234\`.

## Try it

1. Sign in with \`demo@northstar.dev\` / \`demo1234\` — you should land on the **Invoices** dashboard.
2. Click **Export CSV** — the page confirms \`Exported invoices to invoices.csv\`.
`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proseproof-plan-'));
  fs.writeFileSync(path.join(root, 'README.md'), README);
  const outDir = path.join(root, 'suite');
  return { root, outDir };
}

test('plan compiles promises into Kane tests plus a policy', () => {
  const { root, outDir } = fixture();
  const plan = planProject({ rootDir: root, docPaths: ['README.md'], url: 'http://localhost:4177', outDir });
  assert.equal(plan.claims.length, 2);
  assert.equal(plan.files.length, 2);
  assert.ok(fs.existsSync(plan.policyPath));
  assert.match(fs.readFileSync(plan.files[0], 'utf8'), /^---\nmode: testing/m);
});

test('a normal plan keeps Kane recordings so unchanged tests replay', () => {
  const { root, outDir } = fixture();
  const plan = planProject({ rootDir: root, docPaths: ['README.md'], url: 'http://localhost:4177', outDir });
  const recording = path.join(plan.suiteDir, 'tests', 'output-N-01-sign-in');
  fs.mkdirSync(recording, { recursive: true });
  fs.writeFileSync(path.join(recording, 'Result.md'), 'recorded\n');

  planProject({ rootDir: root, docPaths: ['README.md'], url: 'http://localhost:4177', outDir });
  assert.ok(fs.existsSync(recording), 'recording should survive a normal plan');
});

test('--fresh drops recordings so a harness failure cannot be inherited', () => {
  const { root, outDir } = fixture();
  const plan = planProject({ rootDir: root, docPaths: ['README.md'], url: 'http://localhost:4177', outDir });
  const recording = path.join(plan.suiteDir, 'tests', 'output-N-01-sign-in');
  fs.mkdirSync(recording, { recursive: true });
  fs.writeFileSync(path.join(recording, 'Result.md'), 'recorded\n');

  planProject({ rootDir: root, docPaths: ['README.md'], url: 'http://localhost:4177', outDir, fresh: true });
  assert.equal(fs.existsSync(recording), false, 'recording should be removed by --fresh');
  assert.ok(fs.existsSync(plan.files[0]), 'test definitions are not removed');
});

test('reauthoring a patched promise drops only that recording', () => {
  const { root, outDir } = fixture();
  const plan = planProject({ rootDir: root, docPaths: ['README.md'], url: 'http://localhost:4177', outDir });
  const testsDir = path.join(plan.suiteDir, 'tests');
  const n01 = path.join(testsDir, 'output-N-01-sign-in');
  const n02 = path.join(testsDir, 'output-N-02-click-export-csv');
  fs.mkdirSync(n01, { recursive: true });
  fs.mkdirSync(n02, { recursive: true });

  planProject({
    rootDir: root,
    docPaths: ['README.md'],
    url: 'http://localhost:4177',
    outDir,
    reauthor: ['N-02'],
  });
  assert.ok(fs.existsSync(n01), 'untouched recordings replay');
  assert.equal(fs.existsSync(n02), false, 'the patched promise is authored again');
});
