import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = 'examples/northstar-ledger';

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

try {
  execFileSync('git', ['checkout', '--', fixture], { cwd: root, stdio: 'pipe' });
} catch (error) {
  const detail = (error.stderr || error.stdout || '').toString().trim();
  console.error(`Could not restore ${fixture} from git.${detail ? `\n${detail}` : ''}`);
  console.error('Commit the broken baseline before recording, or re-copy the fixture by hand.');
  process.exit(1);
}

const server = read(`${fixture}/server.js`);
const readme = read(`${fixture}/README.md`);
const checks = [
  ['APP_BUG planted (CSV export throws on a numeric invoice number)', server.includes('invoice.number.padStart')],
  ['DOC_DRIFT planted (app says "Collected this month")', server.includes('Collected this month')],
  ['DOC_DRIFT planted (README promises "Paid this month")', readme.includes('Paid this month')],
  ['healer artefacts reverted', !server.includes('String(invoice.number).padStart')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nBaseline is not in the expected broken state. Recording would show the wrong story.');
  process.exit(1);
}

console.log(`\n${fixture} is back to the broken baseline. Restart the app before the next take.`);
