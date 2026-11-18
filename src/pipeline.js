import fs from 'node:fs';
import path from 'node:path';
import { extractClaims } from './extractor/extract.js';
import { compileSuite, testFileName } from './compiler/compile.js';
import { runKane, parseLines, findEvent, memberRunEnds, lintPolicy, kaneVersion } from './runner/kane.js';
import { unzipTo, readPack } from './evidence/pack.js';
import { triageRun, summarizeTriage } from './triage/classify.js';
import { ensureDir, readText, writeJson, writeText, rmrf, relativeTo, timestampId, listFiles } from './util/fsx.js';

export const RUNS_DIR = '.proseproof/runs';
export const SUITE_DIR = '.proseproof/suite';

function mergePacks(packs) {
  if (packs.length === 1) return packs[0];
  const tests = [];
  const seen = new Set();
  const failures = [];
  for (const pack of packs) {
    for (const test of pack.tests || []) {
      const key = test.testId || test.dirName;
      if (seen.has(key)) continue;
      seen.add(key);
      tests.push(test);
    }
    failures.push(...(pack.failures || []));
  }
  return { run: packs[0].run, failures, tests, testDir: packs[0].testDir };
}

export function resolveDocs(rootDir, docPaths) {
  const resolved = (docPaths && docPaths.length ? docPaths : ['README.md'])
    .map((entry) => path.resolve(rootDir, entry))
    .filter((file) => fs.existsSync(file));
  return resolved.map((file) => ({ path: file, content: readText(file, '') }));
}

export function planProject({ rootDir, docPaths, url, outDir }) {
  const docs = resolveDocs(rootDir, docPaths);
  if (!docs.length) throw new Error('No documentation files found. Pass --docs README.md');
  const extracted = extractClaims({ docs, baseUrl: url });
  if (!extracted.claims.length) {
    throw new Error('No browser-verifiable promises found. Add a "Try it" section with steps and expected outcomes.');
  }
  const targetUrl = url || extracted.setup.baseUrl;
  if (!targetUrl) throw new Error('No start URL. Pass --url http://localhost:3000');
  extracted.setup.baseUrl = targetUrl;

  const suiteDir = outDir || path.join(rootDir, SUITE_DIR);
  const compiled = compileSuite({ claims: extracted.claims, setup: extracted.setup, url: targetUrl, outDir: suiteDir });

  // Remove stale generated tests but keep recordings for tests that still exist.
  const keep = new Set(compiled.files.map((file) => path.basename(file)));
  for (const file of listFiles(compiled.testsDir, (entry) => entry.endsWith('_test.md'))) {
    if (!keep.has(path.basename(file))) rmrf(file);
  }

  writeJson(path.join(suiteDir, 'claims.json'), {
    generatedAt: new Date().toISOString(),
    url: targetUrl,
    docs: docs.map((doc) => relativeTo(rootDir, doc.path)),
    setup: extracted.setup,
    warnings: extracted.warnings,
    claims: extracted.claims,
  });

  return {
    claims: extracted.claims,
    setup: extracted.setup,
    warnings: extracted.warnings,
    docs: docs.map((doc) => relativeTo(rootDir, doc.path)),
    files: compiled.files,
    policyPath: compiled.policyPath,
    policyId: compiled.policyId,
    suiteDir,
    url: targetUrl,
  };
}

export async function executeSuite({ rootDir, files, policyPath, name = 'proseproof', parallel = 2, timeoutMs = 1_500_000 }) {
  const lint = await lintPolicy(policyPath, { cwd: rootDir });
  if (lint.code !== 0) {
    const problems = (lint.report?.files || []).flatMap((file) => file.diagnostics || []);
    const details = problems.map((item) => `${item.code}: ${item.message}`).join('; ');
    throw new Error(`Policy lint failed${details ? `: ${details}` : ''}`);
  }

  const relFiles = files.map((file) => relativeTo(rootDir, file));
  const args = [
    'testrun', 'run', ...relFiles,
    '--agent',
    '--stream-members',
    '--parallel', String(parallel),
    '--on-failure', 'continue',
    '--policy', relativeTo(rootDir, policyPath),
    '--name', name,
  ];

  const startedAt = Date.now();
  const result = await runKane(args, { cwd: rootDir, timeoutMs });
  const events = parseLines(result.lines);
  const verdict = findEvent(events, 'verdict');
  const summary = findEvent(events, 'testrun_summary');
  const done = findEvent(events, 'testrun_done');
  const memberRuns = memberRunEnds(events);

  let packPath = null;
  let sealed = false;
  const evidenceId = verdict?.evidence_id || summary?.execution?.evidence_id || '';
  if (evidenceId) {
    const candidate = path.join(rootDir, '.testmuai', 'evidence', `${evidenceId}.evidence`);
    if (fs.existsSync(candidate)) {
      packPath = candidate;
      sealed = true;
    }
  }
  if (!packPath) {
    const dir = path.join(rootDir, '.testmuai', 'evidence');
    if (fs.existsSync(dir)) {
      const packs = fs.readdirSync(dir)
        .filter((file) => file.endsWith('.evidence'))
        .map((file) => ({ file: path.join(dir, file), mtime: fs.statSync(path.join(dir, file)).mtimeMs }))
        .filter((entry) => entry.mtime >= startedAt - 2000)
        .sort((a, b) => b.mtime - a.mtime);
      if (packs.length) packPath = packs[0].file;
    }
  }

  // A broken member stops Kane from sealing a suite pack. Each member pack is still sealed
  // and judgeable, so use those instead of losing every verdict to one harness failure.
  const memberPacks = [];
  if (!sealed) {
    const seen = new Set();
    for (const member of summary?.authored || []) {
      if (!member.execution_id || seen.has(member.execution_id)) continue;
      const candidate = path.join(rootDir, '.testmuai', 'evidence', `${member.execution_id}.evidence`);
      if (fs.existsSync(candidate)) {
        seen.add(member.execution_id);
        memberPacks.push(candidate);
      }
    }
  }

  return {
    code: result.code,
    stderr: result.stderr,
    events,
    verdict,
    summary,
    done,
    memberRuns,
    packPath,
    packPaths: sealed ? [packPath] : memberPacks.length ? memberPacks : packPath ? [packPath] : [],
    sealed,
    durationMs: Date.now() - startedAt,
  };
}

export async function analyzePack({ rootDir, packPath, packPaths, runDir, claims, memberRuns }) {
  const inputs = (packPaths && packPaths.length ? packPaths : [packPath]).filter((item) => item && fs.existsSync(item));
  if (!inputs.length) {
    throw new Error('Kane CLI did not produce an evidence pack.');
  }

  const packs = [];
  for (const [index, input] of inputs.entries()) {
    const isDirectory = fs.statSync(input).isDirectory();
    const packDir = isDirectory ? input : path.join(runDir, `pack-${index}`);
    if (!isDirectory) {
      rmrf(packDir);
      await unzipTo(input, packDir);
    }
    packs.push(readPack(packDir));
  }

  const pack = mergePacks(packs);
  const triage = triageRun({ claims, tests: pack.tests, memberRuns });

  const shotsDir = ensureDir(path.join(runDir, 'shots'));
  for (const item of triage) {
    if (!item.evidence.screenshot) continue;
    const ext = path.extname(item.evidence.screenshot) || '.jpg';
    const target = path.join(shotsDir, `${item.claimId}${ext}`);
    fs.copyFileSync(item.evidence.screenshot, target);
    item.screenshot = path.basename(target);
  }

  return { pack, triage, summary: summarizeTriage(triage) };
}

export async function runCheck({ rootDir, docPaths, url, mode = 'check', parallel = 2, onEvent }) {
  const plan = planProject({ rootDir, docPaths, url });
  const runId = `${timestampId()}-${mode}`;
  const runDir = ensureDir(path.join(rootDir, RUNS_DIR, runId));

  onEvent?.({ type: 'plan', plan });
  for (const warning of plan.warnings) onEvent?.({ type: 'warning', message: warning });
  onEvent?.({ type: 'suite', files: plan.files, policyPath: plan.policyPath });

  const execution = await executeSuite({
    rootDir,
    files: plan.files,
    policyPath: plan.policyPath,
    name: `proseproof-${mode}`,
    parallel,
    timeoutMs: 1_500_000,
  });

  onEvent?.({ type: 'execution', execution });
  writeText(path.join(runDir, 'kane.ndjson'), execution.events.map((event) => JSON.stringify(event)).join('\n') + '\n');

  const analyzed = await analyzePack({
    rootDir,
    packPath: execution.packPath,
    packPaths: execution.packPaths,
    runDir,
    claims: plan.claims,
    memberRuns: execution.memberRuns,
  });

  const kane = await kaneVersion({ cwd: rootDir });
  const credits = execution.memberRuns.reduce((sum, item) => sum + (item.run?.credits_consumed || 0), 0);
  const claimById = new Map(plan.claims.map((claim) => [claim.id, claim]));
  const claims = analyzed.triage.map((item) => {
    const source = claimById.get(item.claimId) || null;
    return {
      ...item,
      citation: source?.citation || null,
      location: source?.location || null,
      quote: source?.quote || null,
      text: source?.text || null,
      section: source?.section || null,
    };
  });
  const policyReport = execution.verdict?.policies?.[0] || null;
  const policyFile = policyReport?.file && fs.existsSync(policyReport.file)
    ? JSON.parse(readText(policyReport.file, '{}'))
    : null;

  const report = {
    id: runId,
    createdAt: new Date().toISOString(),
    mode,
    url: plan.url,
    docs: plan.docs,
    kaneVersion: kane,
    durationMs: execution.durationMs,
    exitCode: execution.code,
    credits: Number(credits.toFixed(2)),
    policy: {
      id: plan.policyId,
      result: execution.verdict?.result || (execution.code === 0 ? 'pass' : 'fail'),
      exitCode: execution.verdict?.exit_code ?? execution.code,
      counts: policyReport?.counts || null,
      failedGateIds: policyReport?.failed_gate_ids || [],
      gates: policyFile?.gates || [],
      file: policyReport?.file || null,
      error: execution.verdict?.error || null,
    },
    evidence: {
      id: execution.verdict?.evidence_id || null,
      sealed: execution.sealed,
      packPath: execution.packPath ? relativeTo(rootDir, execution.packPath) : null,
      packs: (execution.packPaths || []).map((item) => relativeTo(rootDir, item)),
      run: analyzed.pack.run,
      tests: analyzed.pack.tests.map((test) => ({
        testId: test.testId,
        claimId: test.claimId,
        status: test.status,
        durationMs: test.durationMs,
      })),
    },
    summary: analyzed.summary,
    claims,
    warnings: plan.warnings,
    claimsSource: plan.claims,
    setup: plan.setup,
    guard: null,
    diff: null,
  };

  writeJson(path.join(runDir, 'report.json'), report);
  writeJson(path.join(runDir, 'triage.json'), analyzed.triage);
  writeJson(path.join(runDir, 'claims.json'), plan.claims);
  writeText(path.join(runDir, 'summary.txt'), summarize(report));

  return { plan, execution, analyzed, report, runDir, runId };
}

export function summarize(report) {
  const lines = [];
  lines.push(`${report.summary.proven}/${report.summary.total} documented promises proven in Chrome`);
  if (report.summary.lied) lines.push(`${report.summary.lied} app bug(s) caught`);
  if (report.summary.drifted) lines.push(`${report.summary.drifted} documentation drift(s) caught`);
  if (report.summary.platform) lines.push(`${report.summary.platform} harness failure(s)`);
  if (report.summary.unverifiable) lines.push(`${report.summary.unverifiable} unverifiable`);
  lines.push(`Kane policy ${String(report.policy.result).toUpperCase()}`);
  return lines.join(' · ');
}
