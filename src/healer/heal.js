import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheck } from '../pipeline.js';
import { extractClaims } from '../extractor/extract.js';
import { guardPatch, guardSelfTest } from '../guard/anticheat.js';
import { proposePatch, applyEdits, readFiles, agentConfig } from './agent.js';
import { writeJson, writeText, readText, listFiles, ensureDir, relativeTo } from '../util/fsx.js';

const EXCLUDED = /(^|[\\/])(node_modules|\.git|\.proseproof|\.testmuai|spikes|demo|dist|coverage|output-)([\\/]|$)/i;
const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.html', '.css', '.json']);

export function collectSources(rootDir, patterns = []) {
  const roots = patterns.length ? patterns : ['.'];
  const out = [];
  for (const entry of roots) {
    const target = path.resolve(rootDir, entry);
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    const files = stat.isDirectory()
      ? listFiles(target, (file) => SOURCE_EXT.has(path.extname(file).toLowerCase()) && !EXCLUDED.test(file))
      : [target];
    for (const file of files) {
      const relative = relativeTo(rootDir, file);
      if (EXCLUDED.test(relative)) continue;
      if (fs.statSync(file).size > 80_000) continue;
      out.push(relative);
    }
  }
  return [...new Set(out)].slice(0, 40);
}

async function waitForUrl(url, timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (response.status < 500) return true;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export function unifiedDiff(edits, rootDir) {
  const chunks = [];
  for (const edit of edits) {
    const before = readText(path.join(rootDir, edit.file), '').split(/\r?\n/);
    const after = before.join('\n').replace(edit.search, edit.replace).split('\n');
    const beforeIndex = before.findIndex((line) => line.includes(edit.search.split('\n')[0]));
    const afterIndex = after.findIndex((line) => line.includes(edit.replace.split('\n')[0]));
    chunks.push(`--- a/${edit.file}`);
    chunks.push(`+++ b/${edit.file}`);
    chunks.push(`@@ -${Math.max(1, beforeIndex + 1)},${before.length} +${Math.max(1, afterIndex + 1)},${after.length} @@`);
    for (const line of before) chunks.push(`-${line}`);
    for (const line of after) chunks.push(`+${line}`);
  }
  return chunks.join('\n');
}

export function gitDiff(rootDir, files) {
  try {
    return execFileSync('git', ['diff', '--', ...files], { cwd: rootDir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

export async function heal({ rootDir, docPaths, url, source = [], healthUrl = null, fresh = false, headless = false, onEvent }) {
  const first = await runCheck({ rootDir, docPaths, url, mode: 'check', fresh, headless, onEvent });

  const beforeSummary = first.report.summary;
  const failing = first.report.claims.filter((claim) => claim.status !== 'PROVEN');
  const alreadyGreen = failing.length === 0 && first.report.policy.result === 'pass';

  const guard = guardSelfTest(first.plan.claims);
  onEvent?.({ type: 'guard', guard });

  if (alreadyGreen) {
    first.report.guard = guard;
    first.report.heal = {
      healed: false,
      steps: [
        { state: 'done', title: 'Kane check', detail: `${beforeSummary.proven}/${beforeSummary.total} promises proven. Policy already passing.` },
      ],
      guard,
    };
    writeJson(path.join(first.runDir, 'report.json'), first.report);
    return { ...first, second: first, healed: false, guard, before: first.report };
  }

  const config = agentConfig();
  const docRel = first.report.docs;
  const sourceRel = collectSources(rootDir, source.length ? source : ['src', 'app', 'server.js', 'examples']);
  const allowedFiles = [...new Set([...docRel, ...sourceRel])];

  const patchLog = [];
  const reauthor = new Set();
  let currentClaims = first.plan.claims;
  let workingDocs = first.plan.claims
    ? docRel.map((rel) => ({ path: path.resolve(rootDir, rel), rel, content: readText(path.resolve(rootDir, rel), '') }))
    : [];

  for (const failure of failing) {
    if (failure.status === 'UNVERIFIABLE') {
      const reason = failure.classification === 'PLATFORM_ERROR'
        ? `Kane could not judge this claim: ${failure.reason}`
        : 'Unverifiable failure — no patch attempted.';
      patchLog.push({ claimId: failure.claimId, skipped: true, reason });
      onEvent?.({ type: 'patch-skipped', claimId: failure.claimId, reason });
      // A harness failure leaves a recording that cannot be trusted. Re-author it on the
      // second run instead of replaying the crash.
      if (failure.classification === 'PLATFORM_ERROR') reauthor.add(failure.claimId);
      continue;
    }
    const claim = currentClaims.find((item) => item.id === failure.claimId);
    if (!claim) continue;

    let attempt = 0;
    let violations = [];
    let accepted = null;

    while (attempt < 3 && !accepted) {
      attempt += 1;
      const files = readFiles(rootDir, allowedFiles);
      let proposal;
      try {
        proposal = await proposePatch({ claim, triage: failure, files, attempt, violations });
      } catch (error) {
        patchLog.push({ claimId: failure.claimId, attempt, error: error.message });
        break;
      }

      if (proposal.problems?.length) {
        violations = proposal.problems.map((message) => ({ code: 'PATCH_INVALID', message }));
        patchLog.push({ claimId: failure.claimId, attempt, rejected: true, violations });
        continue;
      }
      if (!proposal.edits?.length) {
        patchLog.push({ claimId: failure.claimId, attempt, rejected: true, violations: [{ code: 'NO_EDITS', message: proposal.parseError || 'Agent returned no edits.' }] });
        continue;
      }

      const afterDocs = workingDocs.map((doc) => {
        let content = doc.content;
        for (const edit of proposal.edits) {
          const matchPath = edit.file.split('/').join(path.sep);
          const isDoc = path.resolve(rootDir, edit.file) === path.resolve(doc.path) || matchPath === doc.rel;
          if (isDoc) content = content.replace(edit.search, edit.replace);
        }
        return { path: doc.path, content };
      });
      const after = extractClaims({ docs: afterDocs, baseUrl: url });

      const guardResult = guardPatch({
        before: currentClaims,
        after: after.claims,
        edits: proposal.edits,
        allowedFiles,
      });

      if (!guardResult.ok) {
        violations = guardResult.violations;
        patchLog.push({ claimId: failure.claimId, attempt, rejected: true, violations });
        continue;
      }

      const applied = applyEdits(rootDir, proposal.edits);
      accepted = { proposal, applied, guard: guardResult, attempt };
      // The artifact changed, so the old recording proves the old behaviour. Force a
      // fresh authoritative run for this claim on the second pass.
      reauthor.add(failure.claimId);
      workingDocs = workingDocs.map((doc) => {
        let content = doc.content;
        for (const edit of proposal.edits) {
          if (path.resolve(rootDir, edit.file) === path.resolve(doc.path)) {
            content = content.replace(edit.search, edit.replace);
          }
        }
        return { ...doc, content };
      });
      currentClaims = extractClaims({
        docs: workingDocs.map((doc) => ({ path: doc.path, content: doc.content })),
        baseUrl: url,
      }).claims;
      patchLog.push({
        claimId: failure.claimId,
        attempt,
        accepted: true,
        diagnosis: proposal.diagnosis,
        model: proposal.model || null,
        edits: applied.map((edit) => ({ file: edit.file, reason: edit.reason })),
        guard: guardResult.matches,
      });
      onEvent?.({ type: 'patch', claimId: failure.claimId, accepted });
    }

    if (!accepted) {
      onEvent?.({ type: 'patch-failed', claimId: failure.claimId });
    }
  }

  const appliedEdits = patchLog.flatMap((entry) => entry.edits || []);
  const touchedFiles = [...new Set(appliedEdits.map((edit) => edit.file))];

  if (touchedFiles.length) {
    const healthy = await waitForUrl(healthUrl || url, 30_000);
    onEvent?.({ type: 'health', healthy });
  }

  const second = await runCheck({ rootDir, docPaths, url, mode: 'heal', reauthor: [...reauthor], headless, onEvent });
  second.report.before = {
    summary: beforeSummary,
    policy: first.report.policy,
    claims: first.report.claims,
    runId: first.runId,
  };
  second.report.guard = guard;
  second.report.diff = touchedFiles.length ? (gitDiff(rootDir, touchedFiles) || unifiedDiff(appliedEdits, rootDir)) : '';
  second.report.agent = {
    provider: config.provider,
    model: config.model || null,
    patches: patchLog,
  };
  second.report.heal = {
    healed: second.report.policy.result === 'pass',
    steps: [
      {
        state: 'fail',
        title: 'Kane runs the README in Chrome',
        detail: `${beforeSummary.proven}/${beforeSummary.total} promises proven · ${beforeSummary.lied} app bug(s) · ${beforeSummary.drifted} doc drift(s) · policy ${String(first.report.policy.result).toUpperCase()}`,
      },
      {
        state: 'done',
        title: 'ProseProof triages the failure',
        detail: first.report.claims.filter((claim) => claim.status !== 'PROVEN').map((claim) => `${claim.claimId}: ${claim.classification} — ${claim.reason}`).join(' '),
      },
      {
        state: 'done',
        title: 'Anti-cheat guard self-test',
        detail: guard.rejected
          ? `A patch that deleted claim ${guard.removedClaim} was rejected before any repair was accepted.`
          : 'The guard failed to reject a promise-deleting patch. Repair was not trusted.',
        code: (guard.violations || []).map((violation) => `${violation.code}: ${violation.message}`).join('\n') || undefined,
      },
      {
        state: 'done',
        title: 'Agent repairs the real cause',
        detail: patchLog.filter((entry) => entry.accepted).map((entry) => `${entry.claimId}: ${entry.diagnosis || 'minimal patch'} (${entry.edits.length} edit${entry.edits.length === 1 ? '' : 's'})`).join(' · ') || 'No patch was accepted.',
      },
      {
        state: second.report.policy.result === 'pass' ? 'done' : 'fail',
        title: 'Kane re-checks the truth',
        detail: `${second.report.summary.proven}/${second.report.summary.total} promises proven · policy ${String(second.report.policy.result).toUpperCase()}`,
      },
    ],
    guard,
  };

  writeJson(path.join(second.runDir, 'report.json'), second.report);
  writeText(path.join(second.runDir, 'diff.patch'), second.report.diff || '');
  return { ...second, first, second, healed: second.report.policy.result === 'pass', guard, before: first.report };
}
