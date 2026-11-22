import path from 'node:path';
import { ensureDir, writeText, slugify } from '../util/fsx.js';
import { speakMarkdown } from '../extractor/extract.js';

const POLICY_ID = 'proseproof-truth-gate';

export const POLICY_YAML = `policy: ${POLICY_ID}
requires:
  catalog: kane-cli
  version: ">=1"
gates:
  - id: no-failed-tests
    metric: totals.failed
    equals: 0
    severity: blocking
    message: Every documented promise must pass in a real browser.
  - id: all-tests-pass
    metric: pass_rate
    min: 1
    severity: blocking
    message: A README claim regressed against the running app.
  - id: every-test-asserts
    metric: metrics.tests_without_checks
    equals: 0
    severity: blocking
    message: Every generated test must end in a real browser assertion.
  - id: review-heals
    metric: metrics.heal.healed_tests
    max: 0
    severity: warning
    message: A step needed adaptive healing. Review the selector drift.
`;

function signInStep(setup) {
  const { email, password } = setup.credentials || {};
  const lines = ['## Sign in'];
  if (email && password) {
    // Unquoted outcome on purpose: the authoring agent then checks the dashboard
    // semantically instead of doing a strict label match that can read a stale
    // frame right after the login redirect.
    lines.push(
      `Go to the app. If the dashboard is already open, sign out first. ` +
        `Then sign in with "${email}" and "${password}" and submit the form. ` +
        'The step is complete when the page shows the Invoices dashboard.',
    );
  } else {
    lines.push('Go to the app and verify the documented start page is visible.');
  }
  return lines.join('\n');
}

function claimStep(claim, setup) {
  const action = speakMarkdown(claim.rawAction ?? claim.action);
  const expectation = speakMarkdown(claim.rawExpectation ?? claim.expectation);
  const isSignIn = /sign in|log in/i.test(claim.text);
  // "Only paid invoices" is a statement about every row. Saying so keeps the authoring
  // agent from judging a sample and then rejecting a table that was in fact correct.
  const every = expectation && /\bonly\b|\ball\b|\bevery\b/i.test(expectation)
    ? ' Check every visible row rather than a sample.'
    : '';

  if (isSignIn) {
    if (!expectation) return `Go to the app and ${lowerFirst(action)}.`;
    // A sign-in that ends on "you are on the dashboard" can be authored as a bare
    // navigation, which leaves the test with no check of its own. Name the visible
    // landmark so the authoring agent closes with a real assertion.
    const landmark = /\*\*([^*]+)\*\*/.exec(claim.rawExpectation || '')?.[1];
    const check = landmark
      ? `Assert: the page shows the "${landmark}" heading.`
      : 'Assert: the sign-in form is no longer visible.';
    return `Go to the app and ${lowerFirst(action)}, then verify ${expectation}.${every} ${check}`;
  }
  if (!action) {
    return `Go to the app, then verify ${expectation}.${every}`;
  }
  const body = setup.credentials
    ? `From the signed-in dashboard, ${lowerFirst(action)}`
    : upperFirst(action);
  return expectation ? `${body}, then verify ${expectation}.${every}` : `${body}.`;
}

function lowerFirst(value) {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

function upperFirst(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function testFileName(claim) {
  return `${claim.id}-${slugify(claim.title, 40)}_test.md`;
}

export function compileClaim(claim, { setup, url }) {
  const body = [
    '---',
    'mode: testing',
    `url: ${url}`,
    'max_steps: 30',
    `tags: [proseproof, ${claim.id}]`,
    '---',
    '',
    `# ${claim.id} · ${claim.title}`,
    '',
    `<!-- proseproof:claim=${claim.id} source=${claim.location} -->`,
    '',
  ];
  const needsSignIn = Boolean(setup.credentials) && !/sign in|log in/i.test(claim.text);
  if (needsSignIn) {
    body.push(signInStep(setup), '');
  }
  body.push(`## ${claim.title}`, claimStep(claim, setup), '');
  return body.join('\n');
}

export function compileSuite({ claims, setup, url, outDir }) {
  const testsDir = ensureDir(path.join(outDir, 'tests'));
  const files = [];
  for (const claim of claims) {
    const file = path.join(testsDir, testFileName(claim));
    writeText(file, compileClaim(claim, { setup, url }));
    files.push(file);
  }
  const policyPath = writeText(path.join(outDir, 'proseproof.policy.yaml'), POLICY_YAML);
  return { testsDir, files, policyPath, policyId: POLICY_ID };
}

export { POLICY_ID };
