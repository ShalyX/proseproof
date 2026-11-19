import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTest, summarizeTriage } from '../src/triage/classify.js';

const claim = {
  id: 'N-04',
  title: 'Click Export CSV',
  text: 'Click Export CSV and a file named invoices.csv downloads',
  expectation: 'a file named invoices.csv downloads',
};

function run(overrides = {}) {
  return {
    claimId: 'N-04',
    testId: 'test-4',
    status: 'failed',
    failure: null,
    screenshot: null,
    network: [],
    console: [],
    steps: [{ id: '0-1', status: 'passed' }],
    failedStepId: '0-2',
    ...overrides,
  };
}

test('a passing run is PROVEN', () => {
  const result = classifyTest({ test: run({ status: 'passed' }), claim });
  assert.equal(result.status, 'PROVEN');
  assert.equal(result.confidence, 1);
});

test('a 500 during a documented flow is an APP_BUG', () => {
  const result = classifyTest({
    test: run({ network: [{ status: 500, method: 'GET', url: 'http://localhost:4177/api/export' }] }),
    claim,
    memberRun: { verdict: { signals: [{ kind: 'network_failure' }] } },
  });
  assert.equal(result.classification, 'APP_BUG');
  assert.match(result.reason, /returned 500/);
  assert.equal(result.evidence.httpStatus, 500);
});

test('different copy in the same place is DOC_DRIFT', () => {
  const result = classifyTest({
    test: run({
      claimId: 'N-05',
      failure: {
        triage: {
          rca: {
            category: 'application_issue/ui_data_defect',
            root_cause: 'The page renders a different monthly-summary label than the one required by the check.',
          },
        },
      },
    }),
    claim: {
      id: 'N-05',
      title: 'Open Invoices and read the monthly summary',
      text: 'the first card is labelled paid this month and totals every paid invoice',
      expectation: 'the first card is labelled "Paid this month" and totals every paid invoice',
    },
    memberRun: {
      verdict: {
        signals: [{ kind: 'objective_contradiction' }],
        one_liner: 'The page shows "Collected this month" instead of the required "Paid this month"',
      },
    },
  });
  assert.equal(result.classification, 'DOC_DRIFT');
  assert.equal(result.observed, 'Collected this month');
  assert.match(result.reason, /Docs promise/);
});

test('a failure with no separating signal stays UNVERIFIABLE', () => {
  const result = classifyTest({
    test: run({
      failure: { triage: { rca: { category: 'assertion_error.confirmed_product_bug' } } },
    }),
    claim,
  });
  assert.equal(result.classification, 'UNVERIFIABLE');
  assert.equal(result.confidence, 0.4);
});

test('a missing documented outcome is a product defect, not doc drift', () => {
  const result = classifyTest({
    test: run({
      failure: {
        triage: {
          rca: {
            category: 'application_issue/functional_defect',
            root_cause: 'The export action was triggered successfully, but it did not result in the required file download.',
          },
        },
      },
    }),
    memberRun: {
      verdict: {
        signals: [{ kind: 'objective_contradiction', excerpt: 'Final verification failed: "a file downloads"' }],
        one_liner: 'Clicking Export CSV contacts the export service, but the expected invoices.csv file is not downloaded.',
      },
    },
    claim: {
      id: 'N-04',
      title: 'Click Export CSV',
      text: 'click export csv and a file named invoices.csv downloads',
      expectation: 'a file named invoices.csv downloads',
    },
  });
  assert.equal(result.classification, 'APP_BUG');
  assert.equal(result.status, 'LIED');
  assert.equal(result.observed, null);
});

test('an objective contradiction about copy is drift when a different label is quoted', () => {
  const result = classifyTest({
    test: run({
      failure: { triage: { rca: { category: 'application_issue/objective_contradiction' } } },
    }),
    memberRun: {
      verdict: {
        one_liner: 'The card reads "Collected this month" rather than "Paid this month".',
      },
    },
    claim: {
      id: 'N-05',
      title: 'Monthly summary',
      text: 'the first card is labelled "Paid this month"',
      expectation: 'the first card is labelled "Paid this month"',
    },
  });
  assert.equal(result.classification, 'DOC_DRIFT');
  assert.equal(result.observed, 'Collected this month');
});

test('summary counts the three outcomes separately', () => {
  const summary = summarizeTriage([
    { status: 'PROVEN', classification: 'PROVEN' },
    { status: 'LIED', classification: 'APP_BUG' },
    { status: 'DRIFTED', classification: 'DOC_DRIFT' },
    { status: 'UNVERIFIABLE', classification: 'UNVERIFIABLE' },
  ]);
  assert.deepEqual(summary, { total: 4, proven: 1, lied: 1, drifted: 1, platform: 0, unverifiable: 1 });
});

test('a harness crash is never blamed on the app or the docs', () => {
  const result = classifyTest({
    test: run({
      status: 'broken',
      failure: { error: { message: 'failed to start: connect_over_cdp: connect ECONNREFUSED 127.0.0.1:9223' } },
    }),
    claim,
  });
  assert.equal(result.classification, 'PLATFORM_ERROR');
  assert.equal(result.status, 'UNVERIFIABLE');
  assert.match(result.reason, /harness failed/);
});

test('a screenshot timeout is a platform error, not drift', () => {
  const result = classifyTest({
    test: run({
      failure: {
        error: {
          message: 'the automation platform timed out while capturing the required screenshot after navigation',
        },
      },
    }),
    claim,
  });
  assert.equal(result.classification, 'PLATFORM_ERROR');
});

test('Kane naming its own automation bug never becomes a product accusation', () => {
  const result = classifyTest({
    test: run({
      status: 'failed',
      failure: {
        error: { message: 'Final verification failed: "the table lists only paid invoices"' },
        triage: { rca: { category: 'automation_bug/state_transition_bug' } },
      },
    }),
    claim,
  });
  assert.equal(result.classification, 'PLATFORM_ERROR');
  assert.equal(result.status, 'UNVERIFIABLE');
  assert.match(result.reason, /automation bug/);
});
