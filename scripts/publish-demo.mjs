import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = path.join(root, 'demo');
const latestPath = path.join(root, '.proseproof', 'latest.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function copyTree(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) count += copyTree(source, target);
    else {
      fs.copyFileSync(source, target);
      count += 1;
    }
  }
  return count;
}

if (!fs.existsSync(latestPath)) {
  console.error('No run found. Run `node bin/proseproof.js check ...` first.');
  process.exit(1);
}

const latest = readJson(latestPath);
const runDir = path.resolve(root, latest.runDir);
const reportPath = path.join(runDir, 'report.json');
if (!fs.existsSync(reportPath)) {
  console.error(`Missing ${path.relative(root, reportPath)}`);
  process.exit(1);
}

const report = readJson(reportPath);
if (report.policy.result !== 'pass' && !process.argv.includes('--any')) {
  console.error(`Latest run is ${String(report.policy.result).toUpperCase()}, not PASS.`);
  console.error('Re-run after the repair, or pass --any to publish a failing run on purpose.');
  process.exit(1);
}

fs.rmSync(demoDir, { recursive: true, force: true });
fs.mkdirSync(demoDir, { recursive: true });

const shots = copyTree(path.join(runDir, 'shots'), path.join(demoDir, 'shots'));
const evidenceDir = path.join(runDir, 'evidence');
const published = [];

if (fs.existsSync(evidenceDir)) {
  fs.mkdirSync(path.join(demoDir, 'evidence'), { recursive: true });
  for (const file of fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.evidence'))) {
    fs.copyFileSync(path.join(evidenceDir, file), path.join(demoDir, 'evidence', file));
    published.push(`evidence/${file}`);
  }
}

report.evidence = {
  ...report.evidence,
  packPath: null,
  packs: [],
  redacted: published,
};
report.publishedAt = new Date().toISOString();
report.publishedFrom = report.id;

fs.writeFileSync(path.join(demoDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

const header = [
  '# Sealed demo run',
  '',
  `- Run: \`${report.id}\``,
  `- Recorded: ${report.createdAt}`,
  `- Kane CLI: ${report.kaneVersion}`,
  `- Target: ${report.url}`,
  `- Docs: ${report.docs.join(', ')}`,
  `- Policy: **${String(report.policy.result).toUpperCase()}** (${report.policy.id})`,
  `- Claims: ${report.summary.proven}/${report.summary.total} proven · ${report.summary.lied} app bug(s) · ${report.summary.drifted} drift · ${report.summary.platform || 0} harness failure(s)`,
  `- Redacted packs: ${published.length}${report.evidence.validation?.valid ? ' · L1 valid' : ''}`,
  '',
  'This directory is a committed snapshot so a judge can inspect the report without running',
  'Kane CLI or Chrome. Screenshots are the real browser captures from that run. Identity',
  'fields inside the evidence packs were rewritten before publication; the packs still pass',
  '`kane-cli evidence validate --profile L1`.',
  '',
  'Serve it with:',
  '',
  '```bash',
  'npx proseproof demo',
  '```',
  '',
].join('\n');

fs.writeFileSync(path.join(demoDir, 'README.md'), header, 'utf8');

console.log(`Published ${report.id} → demo/`);
console.log(`  screenshots ${shots}`);
console.log(`  packs       ${published.length}`);
console.log(`  policy      ${String(report.policy.result).toUpperCase()}`);
