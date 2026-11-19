import { similarity, tokens } from '../extractor/extract.js';

const QUOTED = /[“"]([^”"]{2,120})[”"]/g;

export function quotedFragments(text) {
  const out = [];
  let match;
  while ((match = QUOTED.exec(String(text || '')))) {
    if (match[1]) out.push(match[1].trim());
  }
  return out;
}

function observedLabel(text, promised) {
  const fragments = quotedFragments(text);
  if (!fragments.length) return null;
  const ranked = fragments
    .map((fragment) => ({ fragment, score: similarity(fragment, promised) }))
    .sort((a, b) => a.score - b.score);
  const best = ranked[0];
  if (!best) return null;
  if (best.score >= 0.85) return null;
  return best.fragment;
}

function networkSeverity(network = []) {
  const server = network.filter((entry) => entry.status >= 500);
  if (server.length) return { level: 'server', entries: server };
  const client = network.filter((entry) => entry.status >= 400);
  if (client.length) return { level: 'client', entries: client };
  return { level: 'none', entries: [] };
}

export function classifyTest({ test, claim, memberRun, breakdown = [] }) {
  const promised = claim?.expectation || claim?.text || test.claimId || 'documented promise';
  const base = {
    claimId: test.claimId,
    title: claim?.title || test.claimId || test.testId,
    status: 'UNVERIFIABLE',
    classification: 'UNVERIFIABLE',
    reason: '',
    confidence: 0,
    promised,
    observed: null,
    evidence: {
      screenshot: test.screenshot || null,
      network: test.network || [],
      console: test.console || [],
      steps: (test.steps || []).length,
      failedStep: test.failedStepId || null,
      kaneCategory: test.failure?.triage?.rca?.category || memberRun?.verdict?.category || null,
      kaneTitle: test.failure?.title || memberRun?.verdict?.bug_title || null,
      kaneOneLiner: memberRun?.verdict?.one_liner || memberRun?.one_liner || null,
      kaneRootCause: test.failure?.triage?.rca?.root_cause || memberRun?.verdict?.root_cause || null,
      kaneSuggestion: test.failure?.triage?.suggested_fix?.summary || memberRun?.verdict?.suggestion || null,
      kaneConfidence: test.failure?.triage?.rca?.confidence || memberRun?.verdict?.confidence || null,
      signals: (memberRun?.verdict?.signals || []).map((signal) => ({
        kind: signal.kind,
        excerpt: signal.excerpt,
      })),
      breakdown,
    },
  };

  if (test.status === 'passed') {
    return {
      ...base,
      status: 'PROVEN',
      classification: 'PROVEN',
      reason: 'Every documented step passed in real Chrome.',
      confidence: 1,
    };
  }

  const failureMessage = test.failure?.error?.message || memberRun?.reason || '';

  // Kane is allowed to fail without the product being wrong. Never blame the docs for the harness.
  const harnessFailure =
    test.status === 'broken' ||
    /connect_over_cdp|ECONNREFUSED|automation platform|timed out while capturing|screenshot|target closed|browser has been closed|navigation timeout/i.test(
      `${failureMessage} ${base.evidence.kaneRootCause || ''}`,
    );

  if (harnessFailure) {
    return {
      ...base,
      status: 'UNVERIFIABLE',
      classification: 'PLATFORM_ERROR',
      confidence: 0.2,
      reason: `Kane's browser harness failed before it could judge the claim: ${failureMessage || 'run did not start'}`,
    };
  }

  const category = String(base.evidence.kaneCategory || '').toLowerCase();
  const signalKinds = base.evidence.signals.map((signal) => String(signal.kind || '').toLowerCase());
  const network = networkSeverity(test.network);
  const consoleError = (test.console || []).length > 0;
  const oneLiner = base.evidence.kaneOneLiner || '';
  const rootCause = base.evidence.kaneRootCause || '';

  // Kane names its own failures. A test that misread a correct page is not a product
  // defect and not documentation drift; it proved nothing either way.
  if (/^automation_bug\//.test(category)) {
    return {
      ...base,
      status: 'UNVERIFIABLE',
      classification: 'PLATFORM_ERROR',
      confidence: 0.3,
      reason: `Kane reported its own automation bug (${category}): ${rootCause || oneLiner || failureMessage}`,
    };
  }

  if (network.level === 'server' || /api_error|server_error|network_failure/.test(category) || signalKinds.includes('network_failure')) {
    const entry = network.entries[0];
    return {
      ...base,
      status: 'LIED',
      classification: 'APP_BUG',
      confidence: network.level === 'server' ? 0.96 : 0.82,
      reason: entry
        ? `${entry.method} ${entry.url} returned ${entry.status} during a documented user flow.`
        : base.evidence.kaneRootCause || 'The running app failed a documented flow.',
      evidence: { ...base.evidence, httpStatus: entry?.status || null, httpUrl: entry?.url || null },
    };
  }

  if (consoleError && /console_error/.test(signalKinds.join(' '))) {
    return {
      ...base,
      status: 'LIED',
      classification: 'APP_BUG',
      confidence: 0.8,
      reason: base.evidence.console[0]?.text || 'The page threw a console error during the documented flow.',
    };
  }

  // Copy drift needs evidence about copy. A generic "objective contradiction" can be
  // a missing file, a wrong total, or a dead download; that is a product defect.
  const copyCategory = /ui_data_defect|ui_mismatch|content_mismatch|copy|label|wording/.test(category);
  const copyPhrase = /different .*(label|copy|wording|heading|text)|instead of|rather than|labelled|labeled/i.test(
    `${oneLiner} ${rootCause} ${failureMessage}`,
  );
  const observed = observedLabel(`${oneLiner} ${rootCause}`, promised);
  const looksLikeCopy = copyCategory || copyPhrase || Boolean(observed);

  if (looksLikeCopy) {
    const driftScore = observed ? similarity(observed, promised) : 0;
    return {
      ...base,
      status: 'DRIFTED',
      classification: 'DOC_DRIFT',
      confidence: observed ? 0.9 : 0.68,
      observed,
      reason: observed
        ? `Docs promise “${promised}”, but Chrome shows “${observed}”.`
        : `Chrome contradicts the documented copy: ${base.evidence.kaneRootCause || failureMessage}`,
      evidence: { ...base.evidence, driftScore },
    };
  }

  // The documented flow ran, but the promised outcome never happened (no file, no row,
  // no confirmation). The doc described the product correctly; the product failed it.
  if (/functional_defect|objective_contradiction|missing_outcome|timeout/.test(category)) {
    return {
      ...base,
      status: 'LIED',
      classification: 'APP_BUG',
      confidence: 0.72,
      reason: base.evidence.kaneRootCause || oneLiner || 'Chrome did not produce the documented outcome.',
    };
  }

  if (/assertion_error/.test(category)) {
    return {
      ...base,
      status: 'UNVERIFIABLE',
      classification: 'UNVERIFIABLE',
      confidence: 0.4,
      reason: 'The assertion failed without enough evidence to separate an app defect from stale documentation.',
    };
  }

  return {
    ...base,
    status: 'UNVERIFIABLE',
    classification: 'UNVERIFIABLE',
    confidence: 0.3,
    reason: base.evidence.kaneRootCause || failureMessage || 'The run failed without a classifiable evidence signal.',
  };
}

export function triageRun({ claims, tests, memberRuns = [] }) {
  const byClaim = new Map();
  for (const claim of claims) byClaim.set(claim.id, claim);
  const byTestId = new Map();
  const byMemberClaim = new Map();
  for (const item of memberRuns) {
    if (item.member?.test_id) byTestId.set(item.member.test_id, item.run);
    const match = /(N-\d+)/.exec(item.member?.path || '');
    if (match) byMemberClaim.set(match[1], item.run);
  }
  const results = tests.map((test) => {
    const claim = byClaim.get(test.claimId) || null;
    const memberRun = byTestId.get(test.testId) || byMemberClaim.get(test.claimId) || null;
    return classifyTest({ test, claim, memberRun });
  });
  return results;
}

export function summarizeTriage(results) {
  const summary = { total: results.length, proven: 0, lied: 0, drifted: 0, platform: 0, unverifiable: 0 };
  for (const result of results) {
    if (result.status === 'PROVEN') summary.proven += 1;
    else if (result.classification === 'APP_BUG') summary.lied += 1;
    else if (result.classification === 'DOC_DRIFT') summary.drifted += 1;
    else if (result.classification === 'PLATFORM_ERROR') summary.platform += 1;
    else summary.unverifiable += 1;
  }
  return summary;
}

export function claimWordOverlap(a, b) {
  const left = tokens(a);
  const right = new Set(tokens(b));
  return left.filter((word) => right.has(word));
}
