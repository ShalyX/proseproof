# Judge walkthrough

Three ways in, from zero-install to full closed loop. Pick the one that fits your
time. Nothing here is simulated: the screenshots and the evidence pack in `demo/`
come from the recorded run whose id is printed in the report header.

---

## A. 60 seconds, no install

Open [`demo/index.html`](demo/index.html) in any browser (double-click it — it is
a self-contained file with relative screenshots).

You are looking at the Truth Console for the healed run:

- the policy stamp (`PASS` or `FAIL`) and the four tallies,
- one row per documented promise, each with the doc quote, the verdict, and the
  real Chrome screenshot,
- the closed-loop timeline, the guard decision, and the diff,
- the Kane policy gates with expected vs actual values.

`demo/README.md` records which run this snapshot came from.

No account, API key, login, or hosted service is needed for this path. The demo
app's own sign-in is printed on its card (`demo@northstar.dev` / `demo1234`), and
the fixture resets on every restart.

## B. 5 minutes, run the truth gate yourself

Requirements: Node 22+, Chrome, and Kane CLI v0.10.5 authenticated as your own
account (`kane-cli --version`).

Add `--headless` to the commands below if Chrome cannot open a visible window
(remote or locked desktop). Without it, Kane's screenshot capture can time out;
ProseProof reports that as a `HARNESS` row instead of blaming the app.

```bash
npm ci
npm run demo:app          # terminal 1, http://localhost:4177
```

```bash
node bin/proseproof.js check \
  --docs examples/northstar-ledger/README.md \
  --url http://localhost:4177
```

Expected, on the deliberately broken baseline:

```text
+ N-01  Sign in                            PROVEN
+ N-02  Use the Show filter and choose Paid PROVEN
+ N-03  Click New Invoice                  PROVEN
x N-04  Click Export CSV                   APP_BUG    README.md:25
! N-05  Open Invoices and read the monthly summary  DOC_DRIFT  README.md:26

x Kane policy FAIL  (proseproof-truth-gate)
· 3/5 documented promises proven in Chrome · 1 app bug(s) caught · 1 documentation drift(s) caught
```

Exact counts can vary by one when Kane's own replay misreads a page it already
verified; those rows are labelled `HARNESS` and explained, never counted as lies.
Exit code is `1` because the policy failed.

Inspect it:

```bash
node bin/proseproof.js report --port 4178
```

The console shows the 500 from `GET /api/export`, the failing request, the
screenshot at the moment of failure, and the `"Collected this month"` copy that
contradicts the README.

## C. 15 minutes, watch the closed loop

Add an agent (optional; `PROSEPROOF_AGENT=recipe` works for the label drift only):

```bash
export PROSEPROOF_AGENT=llm
export PROSEPROOF_LLM_BASE_URL=https://api.vultrinference.com/v1
export PROSEPROOF_LLM_API_KEY=<key>
export PROSEPROOF_LLM_MODEL=deepseek-v4.1-flash-1017
```

```bash
node bin/proseproof.js heal \
  --docs examples/northstar-ledger/README.md \
  --url http://localhost:4177 \
  --health-url http://localhost:4177/api/health \
  --source examples/northstar-ledger \
  --redact <your-name> --redact <your-email>
```

What should happen, in order:

1. the first Kane run fails the policy,
2. triage names `N-04` an `APP_BUG` and `N-05` a `DOC_DRIFT`,
3. the guard self-test rejects a synthetic patch that deletes `N-05`,
4. the agent edits `server.js` (`String(invoice.number).padStart(...)`) and the
   README label, the fixture reloads,
5. Kane re-runs the same docs and the policy passes,
6. the report keeps both runs, the diff, the patch log, and the guard decision.

The second run's claims should be `5/5 PROVEN` (or `4/5` with one `HARNESS` row
if Kane's replay misreads the table again — re-run `heal` after `npm run
demo:reset` for a clean take).

Reset between attempts:

```bash
npm run demo:reset   # git checkout of the fixture + assertions that it is broken
```

## The anti-cheat guard, in isolation

```bash
node bin/proseproof.js guard --docs examples/northstar-ledger/README.md
```

It feeds a promise-deleting patch through the same guard that protects every
agent edit and prints the rejection. This is a self-test and is labelled as one
in the report. It is not a recording of a model choosing to cheat.

## Verify the published evidence

```bash
node bin/proseproof.js verify demo/evidence/redacted.evidence
# Valid (finalized)

kane-cli evidence validate demo/evidence/redacted.evidence --profile L1 --json
# "valid": true
```

The pack in `demo/` is the redacted copy. Identity fields were rewritten before
publication; the screenshots and step records are untouched.

## If Kane CLI or Chrome is unavailable

Use path A. The committed report, screenshots, and pack are the proof. The
repository does not ask a reviewer to install anything to see the result.

## What to look for (and what not to)

| Judging question | Where the answer is |
| --- | --- |
| Does it work end to end? | path B or C, or the committed `demo/report.json` |
| Did Kane CLI catch something real? | `N-04` 500 with the failing request and screenshot; `N-05` copy contradiction |
| Did the agent and Kane CLI communicate? | the heal timeline: Kane verdict → triage → patch → second Kane run |
| Is the claim honest? | `HARNESS` rows, refusal paths, and the limitations section |

Known limits, stated up front: the doc needs a structured "Try it" section; only
browser-observable promises are checked; Kane authentication is interactive, so
the GitHub Action targets a self-hosted runner.
