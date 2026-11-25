# Evidence

Every claim below was executed on the recorded run, not planned. The two runs
this file cites are committed as artifacts in [`demo/`](demo/) and in the
operator's run store; the redacted pack is the copy a judge can inspect offline.

- Code state: the commit that contains this file
- Public artifacts: [repository](https://github.com/ShalyX/proseproof) ·
  [product page](https://shalyx.github.io/proseproof/) ·
  [recorded proof report](https://shalyx.github.io/proseproof/demo/)
- Demo film (3:12, public): https://youtu.be/3jYroIeOCK8
- Machine: Windows 11, Node v24.14.0, Chrome `157.0.8103.79`, `kane-cli` 0.10.5
- Showcase app: `examples/northstar-ledger` at `http://localhost:4177`
- Docs under test: `examples/northstar-ledger/README.md` (5 promises)
- Repair agent: `deepseek-v4.1-flash-1017` through an OpenAI-compatible endpoint
  (Vultr Inference), with the deterministic `recipe` fallback available
- Runs:
  - first check `20261121-204300-check` — started 19:43:00Z, finished 19:52:39Z (9m32s), exit 1
  - healed run `20261121-205247-heal` — started 19:52:47Z, finished 19:59:25Z (6m13s), exit 0

## Critical claim registry

```text
id: C-01
claim: ProseProof extracts discrete, line-cited browser-verifiable promises from README.md / markdown docs and compiles them into runnable Kane CLI *_test.md specs and a lint-clean CEL policy file.
criticality: CRITICAL
category: product
status: PROVEN
proof_standard: `proseproof plan` emits one `_test.md` per promise with a `source=README.md:<line>` citation, plus a policy file that `kane-cli evidence lint-policy` accepts.
method: `node bin/proseproof.js plan --docs examples/northstar-ledger/README.md --url http://localhost:4177` then `kane-cli evidence lint-policy .proseproof/suite/proseproof.policy.yaml --json`.
owner: Engineering / Proof
artifact: `.proseproof/suite/tests/N-01..N-05_test.md`, `.proseproof/suite/claims.json`, `.proseproof/suite/proseproof.policy.yaml`
environment: Windows 11, Node 24.14.0, kane-cli 0.10.5
observed_at: 2026-11-21T19:52:47Z (suite file mtimes), reused verbatim by both runs
limitations: Extracts promises from a structured "Try it" section; docs describing a library API without a browser flow are out of scope. The compiled sign-in prelude names the showcase's post-login landmark, so an app with a different landing page needs that one sentence adjusted in the generated test.
judge_location: README.md "What ProseProof does", JUDGE_WALKTHROUGH.md path B, demo/report.json `claims[].citation`
related_rubric: Ships (25%), Craft (25%)
```

```text
id: C-02
claim: ProseProof runs real Chrome checks through `kane-cli` and catches documented failures that static link checks miss — a silent 500 on a documented export, and a UI label that contradicts the docs.
criticality: CRITICAL
category: sponsor
status: PROVEN
proof_standard: The first run's sealed pack contains the failing step, the `GET /api/export` 500 with request/response evidence, and a policy verdict of `fail` with two blocking gates.
method: `node bin/proseproof.js check --docs examples/northstar-ledger/README.md --url http://localhost:4177` against the broken baseline; inspect `demo/report.json` (published from the healed run's `before` block).
owner: Proof / Engineering
artifact: `.proseproof/runs/20261121-204300-check/report.json`; evidence `62420469-a313-4c61-8bee-066e831703a8`; `demo/report.json` → `before`
environment: Windows 11, Chrome 157, kane-cli 0.10.5, headless
observed_at: 2026-11-21T19:52:39Z (report written)
limitations: Requires a reachable HTTP URL and a Chrome binary; a headed Chrome needs a live desktop session.
judge_location: JUDGE_WALKTHROUGH.md path B, demo/index.html "The redline sheet", README.md "See it working"
related_rubric: Verified (25%, first tie-breaker)
```

```text
id: C-03
claim: ProseProof separates `APP_BUG` from `DOC_DRIFT` using the failure evidence, keeps harness failures in their own `PLATFORM_ERROR` class, and rejects agent patches that delete or weaken a documented promise.
criticality: CRITICAL
category: product
status: PROVEN
proof_standard: The first run classifies N-04 `APP_BUG` from a 5xx on a documented flow and N-05 `DOC_DRIFT` from a quoted label mismatch; the guard rejects a promise-deleting patch with `CLAIM_REMOVED` and `CLAIM_COUNT_DROPPED`; the unit suite pins all four verdicts.
method: Inspect `20261121-204300-check/report.json`; run `node bin/proseproof.js guard --docs examples/northstar-ledger/README.md`; run `npm test`.
owner: Engineering / QA
artifact: `.proseproof/runs/20261121-204300-check/report.json` (`claims[3]`, `claims[4]`); `.proseproof/runs/20261121-205247-heal/report.json` (`guard`); `tests/triage.test.js`, `tests/guard.test.js`
environment: Node 24.14.0
observed_at: 2026-11-21T19:59:35Z (healed report written)
limitations: The guard enforces claim retention and negative-assertion preservation; a subtle semantic rewrite is still surfaced as a warning for human review.
judge_location: README.md "The verdicts" and "The refusal", demo/index.html "The closed loop"
related_rubric: Verified (25%), Craft (25%)
```

```text
id: C-04
claim: ProseProof closes the loop — Kane failure evidence → triaged repair by an agent → second Kane run — and flips the showcase from policy FAIL to policy PASS with 5/5 promises proven.
criticality: CRITICAL
category: sponsor
status: PROVEN
proof_standard: One `proseproof heal` run records the failing check, the accepted patches, the exact diff, the re-run, and a `pass` verdict with zero failed gates.
method: `node bin/proseproof.js heal --docs examples/northstar-ledger/README.md --url http://localhost:4177 --health-url http://localhost:4177/api/health --source examples/northstar-ledger --parallel 2 --fresh --headless --redact <account email> --redact <account name>`.
owner: Engineering / Proof
artifact: `.proseproof/runs/20261121-205247-heal/report.json`; diff touches `examples/northstar-ledger/server.js` and `examples/northstar-ledger/README.md`; agent patches recorded in `report.agent.patches`; evidence `d94bad9a-dffb-4e4c-928e-9671d544e6ba` (sealed)
environment: Windows 11, Chrome 157, kane-cli 0.10.5 (headless), deepseek-v4.1-flash-1017
observed_at: 2026-11-21T19:59:25Z (run finished)
limitations: The live agent needs an OpenAI-compatible endpoint or `--agent-cmd`; the deterministic recipe fallback handles quoted-label drift only. Judges replay the committed pack instead.
judge_location: JUDGE_WALKTHROUGH.md path C, demo/index.html "The repair", video scene S05
related_rubric: Closed loop (25%, second tie-breaker), Ships (25%)
```

```text
id: C-05
claim: ProseProof rewrites account and session identity out of a sealed `.evidence` pack before publication while the pack still passes `kane-cli evidence validate --profile L1`.
criticality: CRITICAL
category: technical
status: PROVEN
proof_standard: The published pack validates at L1 with no diagnostics, the rewritten fields no longer carry the recording account, and the committed snapshot contains no local machine paths.
method: `node bin/proseproof.js verify demo/evidence/redacted.evidence` and `kane-cli evidence validate demo/evidence/redacted.evidence --profile L1 --json`; scan `demo/` for the recording identity and for `C:\Users\`.
owner: Proof / QA
artifact: `demo/evidence/redacted.evidence` (5046393 bytes) → `{"valid":true,"status":"finalized","diagnostics":[]}`; `demo/report.json` written through `scripts/publish-demo.mjs`
environment: kane-cli 0.10.5
observed_at: 2026-11-22T06:41:04Z (validate), 2026-11-21T20:01:02Z (verify)
limitations: Redaction rewrites known identity fields and caller-supplied literals; it is not a general-purpose secret scanner, which is why `npm run audit` runs before publication.
judge_location: README.md "Security and privacy", demo/README.md, JUDGE_WALKTHROUGH.md "Verify the published evidence"
related_rubric: Craft (25%)
```

```text
id: C-06
claim: Automated tests pin the extractor, compiler, triage, anti-cheat guard, redactor, and healer state machine without a browser.
criticality: IMPORTANT
category: reliability
status: PROVEN
proof_standard: `npm test` completes with 37 passing tests and 0 failures on a clean checkout; the fixtures are real Kane results committed under `tests/fixtures/`.
method: `npm test`
owner: Engineering / QA
artifact: `tests/*.test.js`, `tests/fixtures/*`; output archived as `video/out/tests.txt` during the recording
environment: Node 24.14.0, Windows 11
observed_at: 2026-11-21T19:24:06Z
limitations: Unit tests stub the LLM and CLI boundary; real Kane and Chrome are exercised by the recorded runs above, not by `npm test`.
judge_location: README.md "Project status", `.github/workflows/ci.yml`
related_rubric: Craft (25%), Ships (25%)
```

```text
id: C-07
claim: A judge can inspect the complete before/after proof in seconds without an account, API key, or Kane login, and can then run the same CLI against the showcase or their own docs.
criticality: CRITICAL
category: product
status: PROVEN
proof_standard: `demo/index.html` renders the published run from disk with relative screenshots; `proseproof demo` serves it over HTTP and the report plus a screenshot return 200; the same page is legible at 1440 px and 390 px.
method: `node bin/proseproof.js demo --port 4180` + HTTP GET of `/` and `/shots/N-04.jpg`; desktop and narrow-viewport captures with `scripts/capture.mjs`.
owner: Product Storyteller / Visual QA
artifact: `demo/index.html`, `demo/report.json`, `demo/shots/` (10 images), `demo/evidence/redacted.evidence`, `site/index.html`
environment: Windows 11, Chrome 157
observed_at: 2026-11-22T06:55:27Z
limitations: The offline snapshot replays one recorded run; live `check`/`heal` needs Kane CLI, Chrome, and (for app bugs) a model endpoint.
judge_location: JUDGE_WALKTHROUGH.md path A, README.md "Quickstart", `demo/README.md`
related_rubric: Craft (25%), submission judge-run requirement
```

```text
id: C-08
claim: Every judge-facing claim on the landing page, README, walkthrough, demo snapshot, and video matches this registry, with no fabricated metrics and no leaked recording identity.
criticality: CRITICAL
category: product
status: PROVEN
proof_standard: `npm run audit` reports zero findings on the tracked tree (stale markers, non-demo emails, local home paths, unusable commands), and the walkthrough's expected output matches the committed run.
method: `npm run audit` with the recording account name and email supplied as denied literals; cold-read of JUDGE_WALKTHROUGH.md against `demo/report.json`.
owner: Product Storyteller / Judge
artifact: audit output on the tracked tree at 2026-11-22T06:55:54Z; `EVIDENCE.md`, `README.md`, `JUDGE_WALKTHROUGH.md`, `demo/`
environment: Windows 11, git index
observed_at: 2026-11-22T06:55:54Z
limitations: The audit is a deterministic scan, not a proof of tone; the manual cold read remains part of the checklist.
judge_location: all public artifacts
related_rubric: submission audit, Craft (25%)
```

## What the two runs recorded

| Claim | Doc line | First run | After repair |
| --- | --- | --- | --- |
| N-01 Sign in | `README.md:22` | PROVEN | PROVEN |
| N-02 Filter to Paid | `README.md:23` | PROVEN | PROVEN |
| N-03 Create an invoice | `README.md:24` | PROVEN | PROVEN |
| N-04 Export CSV | `README.md:25` | `APP_BUG` — `GET /api/export` 500, `invoice.number.padStart is not a function` | PROVEN |
| N-05 Monthly summary label | `README.md:26` | `DOC_DRIFT` — docs say "Paid this month", Chrome renders "Collected this month" | PROVEN |

Policy gates, recomputed by Kane from the sealed packs:

| Gate | Metric | First run | After repair |
| --- | --- | --- | --- |
| `no-failed-tests` | `totals.failed` | `2` → fail | `0` → pass |
| `all-tests-pass` | `pass_rate` | `0.6` → fail | `1` → pass |
| `every-test-asserts` | `metrics.tests_without_checks` | `0` → pass | `0` → pass |
| `review-heals` | `metrics.heal.healed_tests` | `0` → pass | `0` → pass |

The guard self-test in the healed run is a synthetic patch that deletes N-05; it
is rejected before any agent edit is applied (`CLAIM_REMOVED`,
`CLAIM_COUNT_DROPPED`). The two real patches retained every claim; the N-05
rewrite keeps the promise and changes only the label, with a retention score of
`0.929`.

## Freshness

Any change to `src/`, `examples/northstar-ledger/`, or the compiled policy
invalidates C-01 through C-07 until the runs are repeated and resealed. The
committed `demo/` snapshot is a point-in-time artifact, not a live result: its
run id and timestamp are printed in `demo/README.md` and in the report header.

## Unresolved critical claims

None. All eight claims are executed and recorded above.

## Proof Engine verdict

`PASS` on the committed tree: 5/5 promises proven after repair, Kane policy `PASS`
with four of four gates passing, a sealed pack that validates at L1 after
redaction, and 37/37 automated tests green.
