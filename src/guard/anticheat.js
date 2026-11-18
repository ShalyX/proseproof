import path from 'node:path';
import { similarity } from '../extractor/extract.js';

const WEAKENING = /\b(optional|may|might|possibly|not guaranteed|best effort|unsupported|deprecated)\b/i;

export function matchClaims(before, after) {
  const used = new Set();
  const matches = [];
  for (const claim of before) {
    let best = null;
    for (const candidate of after) {
      if (used.has(candidate.id)) continue;
      const score = similarity(claim.text, candidate.text);
      if (!best || score > best.score) best = { claim: candidate, score };
    }
    if (best && best.score >= 0.55) used.add(best.claim.id);
    matches.push({ before: claim, after: best?.claim || null, score: best?.score || 0 });
  }
  return matches;
}

export function guardPatch({ before, after, edits = [], allowedFiles = null }) {
  const violations = [];
  const matches = matchClaims(before, after);

  for (const match of matches) {
    if (!match.after) {
      violations.push({
        code: 'CLAIM_REMOVED',
        claimId: match.before.id,
        message: `Claim ${match.before.id} disappeared from the docs: “${match.before.quote}”`,
      });
      continue;
    }
    if (match.score < 0.55) {
      violations.push({
        code: 'CLAIM_REWRITTEN',
        claimId: match.before.id,
        message: `Claim ${match.before.id} was rewritten beyond recognition (${Math.round(match.score * 100)}% overlap).`,
      });
    }
    if (WEAKENING.test(match.after.text) && !WEAKENING.test(match.before.text)) {
      violations.push({
        code: 'CLAIM_WEAKENED',
        claimId: match.before.id,
        message: `Claim ${match.before.id} was softened with hedging language instead of being repaired.`,
      });
    }
  }

  if (after.length < before.length) {
    violations.push({
      code: 'CLAIM_COUNT_DROPPED',
      message: `Docs lost ${before.length - after.length} verifiable claim(s). A repair may update wording, not delete promises.`,
    });
  }

  if (allowedFiles) {
    const allowed = new Set(allowedFiles.map((file) => path.resolve(file)));
    for (const edit of edits) {
      if (edit.file && !allowed.has(path.resolve(edit.file))) {
        violations.push({
          code: 'FILE_OUTSIDE_SCOPE',
          file: edit.file,
          message: `Patch touched ${edit.file}, which is outside the approved repair scope.`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    matches: matches.map((match) => ({
      claimId: match.before.id,
      retained: Boolean(match.after),
      similarity: Number(match.score.toFixed(3)),
      before: match.before.quote,
      after: match.after?.quote || null,
    })),
  };
}

export function cheatingPatch(before) {
  if (!before.length) return { after: [], removed: null };
  const removed = before[before.length - 1];
  return {
    after: before.slice(0, -1),
    removed,
    description: `Delete claim ${removed.id} (“${removed.title}”) from the docs and call the suite fixed.`,
  };
}

export function guardSelfTest(before) {
  const cheat = cheatingPatch(before);
  const result = guardPatch({ before, after: cheat.after });
  return {
    description: cheat.description,
    removedClaim: cheat.removed?.id || null,
    rejected: !result.ok,
    violations: result.violations,
  };
}
