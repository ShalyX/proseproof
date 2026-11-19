import fs from 'node:fs';
import path from 'node:path';
import { planProject, runCheck, summarize } from './pipeline.js';
import { heal } from './healer/heal.js';
import { guardSelfTest } from './guard/anticheat.js';
import { extractClaims } from './extractor/extract.js';
import { redactPack } from './redact/redact.js';
import { startServer, serveForever } from './report/server.js';
import { readJson, writeJson, writeText, ensureDir, relativeTo, readText, acquireRunLock } from './util/fsx.js';
import { title, info, step, ok, fail, warn, badge, blank, dim, bold, symbols } from './util/log.js';
import { kaneVersion, validatePack } from './runner/kane.js';

const MULTI = new Set(['docs', 'source', 'policy', 'redact']);

export function parseArgs(argv) {
  const flags = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else if (MULTI.has(key)) {
        flags[key] = [...(Array.isArray(flags[key]) ? flags[key] : []), next];
        index += 1;
      } else {
        flags[key] = next;
        index += 1;
      }
    } else {
      flags._.push(arg);
    }
  }
  return flags;
}

function loadConfig(rootDir) {
  return readJson(path.join(rootDir, 'proseproof.config.json'), {}) || {};
}

function resolveOptions(flags, config) {
  const cwd = path.resolve(flags.cwd || process.cwd());
  const docs = flags.docs
    ? (Array.isArray(flags.docs) ? flags.docs : [flags.docs]).flatMap((entry) => String(entry).split(','))
    : config.docs;
  const url = flags.url || config.url;
  const source = flags.source
    ? (Array.isArray(flags.source) ? flags.source : [flags.source]).flatMap((entry) => String(entry).split(','))
    : config.source || [];
  return {
    cwd,
    docs,
    url,
    source,
    healthUrl: flags['health-url'] || config.healthUrl || null,
    parallel: Number(flags.parallel || config.parallel || 2),
    redact: (Array.isArray(flags.redact) ? flags.redact : flags.redact ? [flags.redact] : config.redact || []),
    port: Number(flags.port || config.port || 4178),
    fresh: Boolean(flags.fresh || config.fresh),
    headless: Boolean(flags.headless || config.headless),
    config,
  };
}

function printClaims(report) {
  for (const claim of report.claims) {
    const status = claim.status === 'PROVEN' ? 'PROVEN' : claim.classification;
    const color = claim.status === 'PROVEN' ? ok : claim.classification === 'APP_BUG' ? fail : claim.classification === 'DOC_DRIFT' ? warn : info;
    color(`${(claim.claimId || '').padEnd(5)} ${String(claim.title).padEnd(32)} ${badge(status)} ${dim(claim.location || '')}`);
  }
}

function printVerdict(report) {
  const pass = report.policy.result === 'pass';
  blank();
  (pass ? ok : fail)(`Kane policy ${String(report.policy.result).toUpperCase()}  ${dim(`(${report.policy.id})`)}`);
  info(summarize(report));
}

async function finalizeEvidence({ report, runDir, rootDir, literals = [] }) {
  const packs = report?.evidence?.packs?.length
    ? report.evidence.packs
    : report?.evidence?.packPath
      ? [report.evidence.packPath]
      : [];
  if (!packs.length) return report;

  const redacted = [];
  for (const [index, rel] of packs.entries()) {
    const abs = path.resolve(rootDir, rel);
    if (!fs.existsSync(abs)) continue;
    const name = packs.length === 1 ? 'redacted.evidence' : `redacted-${String(index + 1).padStart(2, '0')}.evidence`;
    const out = path.join(runDir, 'evidence', name);
    ensureDir(path.dirname(out));
    try {
      const result = await redactPack({ packPath: abs, outPath: out, rootDir, literals });
      redacted.push({
        source: rel,
        path: relativeTo(rootDir, out),
        redactions: result.redactions,
        touched: result.touched,
        validation: result.validation,
      });
    } catch (error) {
      redacted.push({ source: rel, error: error.message });
    }
  }

  report.evidence.redacted = redacted.filter((entry) => entry.path).map((entry) => entry.path);
  report.evidence.validation = redacted.find((entry) => entry.validation)?.validation || null;
  report.evidence.redactions = redacted.reduce((total, entry) => total + (entry.redactions || 0), 0);
  report.evidence.redactionTouched = redacted.flatMap((entry) => entry.touched || []);
  writeJson(path.join(runDir, 'report.json'), report);
  return report;
}

function setLatest(rootDir, runDir) {
  ensureDir(path.join(rootDir, '.proseproof'));
  writeJson(path.join(rootDir, '.proseproof', 'latest.json'), {
    runDir: relativeTo(rootDir, runDir),
    at: new Date().toISOString(),
  });
}

function commandHeader(command, options) {
  title(`ProseProof · ${command}`);
  info(`Target ${options.url || 'from docs'}`);
  info(`Docs ${(options.docs || ['README.md']).join(', ')}`);
}

// Live progress while Kane drives Chrome: one line per promise as it is picked up.
// Verdicts are printed once, from the merged report, never from intermediate events.
function memberLabel(member) {
  const id = (/(N-\d+)/.exec(member?.path || member?.name || '') || [])[1] || 'test';
  const title = member?.title || member?.name || '';
  const clean = String(title).replace(/^[^-]*-/, '').replace(/_/g, ' ').trim();
  return clean ? `${id} ${clean}` : id;
}

function printMemberEvent(event) {
  if (event.phase !== 'start') return;
  info(`${memberLabel(event.member)} — Chrome is checking`);
}

export async function main(argv) {
  const command = argv[0];
  const flags = parseArgs(argv.slice(1));
  const options = resolveOptions(flags, loadConfig(path.resolve(flags.cwd || process.cwd())));

  if (!command || flags.help || command === 'help') {
    console.log(`
ProseProof — executable browser truth gate for docs.

  proseproof plan  --docs README.md --url http://localhost:3000
  proseproof check --docs README.md --url http://localhost:3000 [--serve]
  proseproof heal  --docs README.md --url http://localhost:3000 [--serve]
  proseproof report [--run <dir>] [--port 4178]
  proseproof demo  [--port 4179]
  proseproof guard --docs README.md
  proseproof verify <pack.evidence>
  proseproof init  [--docs README.md] [--url http://localhost:3000]

Flags: --docs, --url, --source, --health-url, --parallel, --serve, --port, --redact, --fresh, --headless
Agent:  PROSEPROOF_AGENT=llm|cmd|recipe
        PROSEPROOF_LLM_BASE_URL / PROSEPROOF_LLM_API_KEY / PROSEPROOF_LLM_MODEL
`);
    return;
  }

  if (command === 'init') {
    const configPath = path.join(options.cwd, 'proseproof.config.json');
    if (fs.existsSync(configPath) && !flags.force) {
      warn(`Config already exists: ${relativeTo(options.cwd, configPath)}`);
      return;
    }
    writeJson(configPath, {
      docs: options.docs || ['README.md'],
      url: options.url || 'http://localhost:3000',
      source: options.source.length ? options.source : ['src'],
      parallel: 2,
      port: 4178,
    });
    ok(`Wrote ${relativeTo(options.cwd, configPath)}`);
    return;
  }

  if (command === 'guard') {
    commandHeader('guard self-test', options);
    const docs = (options.docs || ['README.md']).map((entry) => path.resolve(options.cwd, entry));
    const extracted = extractClaims({
      docs: docs.filter((file) => fs.existsSync(file)).map((file) => ({ path: file, content: readText(file, '') })),
      baseUrl: options.url,
    });
    if (!extracted.claims.length) {
      fail('No verifiable claims found.');
      process.exitCode = 1;
      return;
    }
    const result = guardSelfTest(extracted.claims);
    blank();
    info(`${extracted.claims.length} claims extracted`);
    if (result.rejected) {
      ok(`Rejected: ${result.description}`);
      for (const violation of result.violations) info(`${violation.code}: ${violation.message}`);
    } else {
      fail('Guard failed to reject a promise-deleting patch.');
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'plan') {
    commandHeader('plan', options);
    const plan = planProject({ rootDir: options.cwd, docPaths: options.docs, url: options.url });
    blank();
    for (const claim of plan.claims) {
      info(`${claim.id}  ${claim.title}  ${dim(claim.location)}`);
    }
    blank();
    ok(`${plan.claims.length} documented promises compiled`);
    info(`Kane tests  ${relativeTo(options.cwd, plan.suiteDir)}/tests`);
    info(`Policy      ${relativeTo(options.cwd, plan.policyPath)}`);
    for (const warning of plan.warnings) warn(warning);
    return;
  }

  if (command === 'check' || command === 'heal') {
    commandHeader(command, options);
    if (!options.url) {
      fail('Missing --url. ProseProof needs a running app to check.');
      process.exitCode = 2;
      return;
    }
    const kane = await kaneVersion({ cwd: options.cwd });
    info(`Kane CLI ${kane}`);

    const releaseLock = acquireRunLock(options.cwd, { command });
    try {
      await runTruthCommand();
    } finally {
      releaseLock();
    }
    return;
  }

  async function runTruthCommand() {
    let result;
    if (command === 'heal') {
      result = await heal({
        rootDir: options.cwd,
        docPaths: options.docs,
        url: options.url,
        source: options.source,
        healthUrl: options.healthUrl,
        fresh: options.fresh,
        headless: options.headless,
        onEvent: (event) => {
          if (event.type === 'plan') step(`Extracted ${event.plan.claims.length} promises from ${event.plan.docs.join(', ')}`);
          if (event.type === 'suite') step(`Compiled ${event.files.length} Kane tests + policy gate`);
          if (event.type === 'member') printMemberEvent(event);
          if (event.type === 'guard') {
            if (event.guard.rejected) warn(`Anti-cheat self-test rejected: ${event.guard.description}`);
          }
          if (event.type === 'patch') ok(`Agent patch accepted for ${event.claimId}`);
          if (event.type === 'patch-failed') fail(`No safe patch accepted for ${event.claimId}`);
          if (event.type === 'patch-skipped') warn(`No patch attempted for ${event.claimId}: ${event.reason}`);
          if (event.type === 'warning') warn(event.message);
        },
      });
    } else {
      result = await runCheck({
        rootDir: options.cwd,
        docPaths: options.docs,
        url: options.url,
        mode: 'check',
        parallel: options.parallel,
        fresh: options.fresh,
        headless: options.headless,
        onEvent: (event) => {
          if (event.type === 'plan') step(`Extracted ${event.plan.claims.length} promises from ${event.plan.docs.join(', ')}`);
          if (event.type === 'suite') step(`Compiled ${event.files.length} Kane tests + policy gate`);
          if (event.type === 'member') printMemberEvent(event);
          if (event.type === 'warning') warn(event.message);
        },
      });
    }

    const report = result.report;
    await finalizeEvidence({ report, runDir: result.runDir, rootDir: options.cwd, literals: options.redact });
    setLatest(options.cwd, result.runDir);

    blank();
    printClaims(report);
    printVerdict(report);
    info(`Run        ${relativeTo(options.cwd, result.runDir)}`);
    if (report.evidence?.redacted?.length) {
      info(`Redacted   ${report.evidence.redacted.length} pack(s) ${report.evidence.validation?.valid ? dim('· L1 valid') : dim('· validation warning')}`);
    }

    if (flags.serve) {
      await serveForever({ runDir: result.runDir, report, port: options.port });
      await new Promise(() => {});
    }

    if (report.policy.result !== 'pass') process.exitCode = 1;
    return;
  }

  if (command === 'report') {
    const latest = readJson(path.join(options.cwd, '.proseproof', 'latest.json'), null);
    const runDir = flags.run ? path.resolve(options.cwd, flags.run) : latest ? path.resolve(options.cwd, latest.runDir) : null;
    if (!runDir || !fs.existsSync(path.join(runDir, 'report.json'))) {
      fail('No report found. Run `proseproof check` first.');
      process.exitCode = 2;
      return;
    }
    const report = readJson(path.join(runDir, 'report.json'));
    await serveForever({ runDir, report, port: options.port });
    await new Promise(() => {});
    return;
  }

  if (command === 'demo') {
    const demoDir = path.join(options.cwd, 'demo');
    const reportPath = path.join(demoDir, 'report.json');
    if (!fs.existsSync(reportPath)) {
      fail('No committed demo report found at demo/report.json.');
      process.exitCode = 2;
      return;
    }
    const report = readJson(reportPath);
    await serveForever({ runDir: demoDir, report, port: options.port === 4178 ? 4179 : options.port });
    await new Promise(() => {});
    return;
  }

  if (command === 'verify') {
    const target = flags._[0];
    if (!target) {
      fail('Usage: proseproof verify <pack.evidence>');
      process.exitCode = 2;
      return;
    }
    const result = await validatePack(path.resolve(options.cwd, target), { cwd: options.cwd });
    if (result.code === 0) ok(`Valid (${result.report?.status || 'sealed'})`);
    else fail(`Invalid (exit ${result.code})`);
    if (result.report?.diagnostics?.length) {
      for (const diagnostic of result.report.diagnostics) info(`${diagnostic.severity}: ${diagnostic.message}`);
    }
    process.exitCode = result.code;
    return;
  }

  fail(`Unknown command: ${command}`);
  process.exitCode = 2;
}
