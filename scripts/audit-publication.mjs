#!/usr/bin/env node
/**
 * Publication audit for judge-facing artifacts.
 *
 * Fails when a tracked file leaks a local user path, a non-demo email address,
 * an unexecuted evidence marker, or a command that cannot work for a judge
 * (`npx proseproof` — the package is not published to npm).
 *
 * Usage:
 *   node scripts/audit-publication.mjs [--deny <literal> ...]
 *
 * Extra literals can also be supplied with PROSEPROOF_DENY=a,b. Useful right
 * before publishing: pass the account name and email used to run Kane CLI.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EMAIL_ALLOWLIST = [/@example\.com$/i, /@example\.org$/i, /northstar\.dev$/i, /@users\.noreply\.github\.com$/i];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HOME_PATHS = [
  /C:\\Users\\(?!USER\\|Public\\)([A-Za-z0-9._-]+)/g,
  /\/Users\/(?!Shared\/)([A-Za-z0-9._-]+)/g,
  /\/home\/([A-Za-z0-9._-]+)/g,
];
const STALE = [
  { pattern: /\bTBD\b/g, label: 'TBD marker' },
  { pattern: /\bUNPROVEN\b/g, label: 'UNPROVEN claim status' },
  { pattern: /npx proseproof/g, label: 'npx proseproof (package is not on npm)' },
];

function args() {
  const out = { deny: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--deny' && argv[i + 1]) {
      out.deny.push(argv[i + 1]);
      i += 1;
    }
  }
  const env = process.env.PROSEPROOF_DENY;
  if (env) out.deny.push(...env.split(',').map((s) => s.trim()).filter(Boolean));
  return out;
}

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

const options = args();
const files = trackedFiles();
const findings = [];

for (const file of files) {
  if (!/\.(md|js|mjs|cjs|json|ya?ml|txt|html|css)$/i.test(file)) continue;
  // The audit owns the patterns it searches for; scanning itself always matches.
  if (file === 'scripts/audit-publication.mjs') continue;
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');

  for (const literal of options.deny) {
    let index = text.indexOf(literal);
    while (index !== -1) {
      findings.push({ file, line: lineOf(text, index), rule: 'denied literal', detail: literal });
      index = text.indexOf(literal, index + literal.length);
    }
  }

  for (const match of text.matchAll(EMAIL)) {
    const address = match[0];
    if (EMAIL_ALLOWLIST.some((re) => re.test(address))) continue;
    // Git author lines in generated packs are rewritten for the demo; anything
    // else that looks like a person is worth a human look.
    findings.push({ file, line: lineOf(text, match.index), rule: 'email outside allowlist', detail: address });
  }

  for (const re of HOME_PATHS) {
    for (const match of text.matchAll(re)) {
      const name = match[1];
      if (['USER', 'runner', 'Public', 'Shared'].includes(name)) continue;
      findings.push({ file, line: lineOf(text, match.index), rule: 'local home path', detail: match[0] });
    }
  }

  for (const { pattern, label } of STALE) {
    for (const match of text.matchAll(pattern)) {
      findings.push({ file, line: lineOf(text, match.index), rule: label, detail: path.basename(file) });
    }
  }
}

if (!findings.length) {
  console.log(`Public artifacts clean: ${files.length} tracked files, no leaks or stale markers.`);
  process.exit(0);
}

const byRule = new Map();
for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) || 0) + 1);

console.log(`Publication audit found ${findings.length} issue(s):`);
for (const [rule, count] of byRule) console.log(`  ${count.toString().padStart(3)}  ${rule}`);
console.log('');
for (const finding of findings.slice(0, 60)) {
  console.log(`${finding.file}:${finding.line}  ${finding.rule}  ${finding.detail}`);
}
if (findings.length > 60) console.log(`… ${findings.length - 60} more`);
process.exit(1);
