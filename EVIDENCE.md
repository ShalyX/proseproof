# EVIDENCE

## Evidence plan status

PLANNED (2026-11-18T14:52:00Z) — Claims registered at `EVIDENCE_PLAN`; execution artifacts to be captured during `TECHNICAL_DERISK`, `BUILD_LOOP`, and `PROOF_ENGINE`.

## Critical claim registry

```text
id: C-01
claim: ProseProof extracts discrete, line-cited browser-verifiable promises from README.md / markdown docs and compiles them into runnable Kane CLI *_test.md specs and a lint-clean CEL policy file.
criticality: CRITICAL
category: product
status: UNPROVEN
proof_standard: Automated test + real `kane-cli evidence lint-policy` exit 0 on compiled `proseproof.policy.yaml` + inspected `claims.json` & `*_test.md` artifacts.
method: Run `proseproof plan` on `examples/northstar-ledger/README.md` and run unit/integration tests.
owner: Engineering / Proof
artifact: TBD
environment: Windows 11, Node 24.14.0, kane-cli 0.10.5+
observed_at: PENDING
limitations: Extracts user-facing web/API onboarding promises; pure library/algorithm docs without web flows classify as UNVERIFIABLE.
judge_location: README.md, Truth Console, JUDGE_GUIDE.md
related_rubric: Ships (25%), Craft (25%)
```

```text
id: C-02
claim: ProseProof runs real Chrome browser checks via `kane-cli` and catches real documented failures—including silent 5xx API errors, console errors, and drifted UI labels—that static markdown link checkers miss.
criticality: CRITICAL
category: sponsor
status: UNPROVEN
proof_standard: Reproducible `kane-cli` execution output (NDJSON + exit code 1), sealed `.evidence` pack, and `kane-cli evidence verdict --policy` JSON showing `result: fail` against `examples/northstar-ledger` baseline.
method: Run `proseproof check` against `examples/northstar-ledger` (`broken-baseline`) + compare against static link check.
owner: Proof / Engineering
artifact: TBD
environment: Windows 11, Chrome stable, kane-cli 0.10.5+
observed_at: PENDING
limitations: Requires reachable local/live HTTP URL and Chrome binary.
judge_location: Landing overview, README.md, Demo S01/S03, Truth Console
related_rubric: Prerequisite Bar 2, Verified (25%, 1st tie-breaker)
```

```text
id: C-03
claim: ProseProof accurately classifies Kane failures as APP_BUG vs DOC_DRIFT and blocks agent patches that attempt to pass by deleting or weakening README promises (Anti-Cheat Guard).
criticality: CRITICAL
category: product
status: UNPROVEN
proof_standard: Automated unit + negative anti-cheat test suite plus real showcase classification output (`APP_BUG` for broken export 500; `DOC_DRIFT` for renamed button label).
method: Run `npm test` (triage + anti-cheat test cases) and inspect `proseproof heal` triage artifact.
owner: Engineering / QA
artifact: TBD
environment: Node 24.14.0
observed_at: PENDING
limitations: Anti-cheat guard enforces structural claim-retention & negative-assertion preservation; subtle semantic rewrites remain flagged as warnings for review.
judge_location: README.md, Demo S04, Truth Console
related_rubric: Verified (25%), Craft (25%)
```

```text
id: C-04
claim: ProseProof closes the agent loop (`Kane failure .evidence -> agent diagnosis & patch -> Kane re-verify`) and flips the failing showcase app and README from `POLICY FAIL` to `POLICY PASS` in real Chrome.
criticality: CRITICAL
category: sponsor
status: UNPROVEN
proof_standard: Full `proseproof heal` run log showing: (1) failing `.evidence` + `verdict: fail`, (2) generated git patch repairing source + doc drift, (3) re-run `kane-cli` + `evidence verdict` flipping to `verdict: pass`.
method: End-to-end live run on `examples/northstar-ledger` with OpenAI-powered agent loop (plus deterministic fallback check).
owner: Engineering / Proof
artifact: TBD
environment: Windows 11, Chrome stable, kane-cli 0.10.5+, OpenAI API
observed_at: PENDING
limitations: Live AI patching requires `OPENAI_API_KEY` or configured `--agent-cmd`; offline judge replay uses committed sealed packs.
judge_location: README.md, Demo S04, Truth Console, JUDGE_GUIDE.md
related_rubric: Prerequisite Bar 3, Closed loop (25%, 2nd tie-breaker), Ships (25%)
```

```text
id: C-05
claim: ProseProof redacts sensitive account/session metadata from `.evidence` packs before public sharing while preserving `kane-cli evidence validate --profile L1` validity.
criticality: CRITICAL
category: technical
status: UNPROVEN
proof_standard: Redacted `.evidence` files pass `kane-cli evidence validate <file> --profile L1` (`valid: true`) and secret/PII grep scan returns zero hits (no email, access key, org token).
method: Run ProseProof redactor on live `.evidence` packs, execute `kane-cli evidence validate --profile L1`, and run secret scan.
owner: Proof / QA
artifact: TBD
environment: kane-cli 0.10.5+
observed_at: PENDING
limitations: Redacted packs remove author email/org/share-token fields; L1 structural/hash validation passes while cloud Test Manager upload links are stripped.
judge_location: README.md, Demo S05, Truth Console
related_rubric: Craft (25%), Security/Publication Hygiene
```

```text
id: C-06
claim: Automated unit and integration tests verify extractor, triage, anti-cheat guard, redactor, and healer state-machine behavior without mocks hiding contract drift.
criticality: IMPORTANT
category: reliability
status: UNPROVEN
proof_standard: Passing `npm test` output with exact test count and real committed Kane output fixture assertions.
method: Run `npm test` across clean repo state.
owner: Engineering / QA
artifact: TBD
environment: Node 24.14.0
observed_at: PENDING
limitations: Unit tests mock external LLM/CLI calls while integration tests exercise real `kane-cli` & real Chrome.
judge_location: README.md, JUDGE_GUIDE.md
related_rubric: Craft (25%), Ships (25%)
```

```text
id: C-07
claim: Judges can inspect the complete Before/After proof in <15 seconds via `npm run demo` without API keys or TestMu AI login, or run the live CLI against the showcase app or any URL.
criticality: CRITICAL
category: product
status: UNPROVEN
proof_standard: Clean rehearsal timing of `npm run demo` (<15s) and verified Truth Console rendering across desktop (1440×900) and mobile (390×844) viewports.
method: Execute `npm run demo` + inspect rendered Truth Console via browser capture.
owner: Product Storyteller / Visual QA
artifact: TBD
environment: Windows 11, Chrome
observed_at: PENDING
limitations: `npm run demo` replays committed redacted `.evidence` packs offline; live `check`/`heal` requires `kane-cli` auth + LLM key.
judge_location: README.md, Demo S06, JUDGE_GUIDE.md
related_rubric: Craft (25%), Submission Judge-Run Requirement
```

```text
id: C-08
claim: All judge-facing claims across landing page, README.md, JUDGE_GUIDE, demo video, and submission form are consistent with EVIDENCE.md and contain no fabricated metrics or leaked secrets.
criticality: CRITICAL
category: product
status: UNPROVEN
proof_standard: `audit_publication.py` pass + cross-artifact consistency check in `JUDGE_WALKTHROUGH.md` + `JUDGE_SIMULATION` pass.
method: Run publication audit and independent judge cold-read rehearsal.
owner: Product Storyteller / Judge
artifact: TBD
environment: Local git index + built artifacts
observed_at: PENDING
limitations: None.
judge_location: All public artifacts
related_rubric: Submission Audit, Craft (25%)
```

## Evidence artifacts

To be populated with exact paths, command outputs, `.evidence` IDs, and timestamps during `TECHNICAL_DERISK` and `PROOF_ENGINE`.

## Freshness / invalidation notes

Any code change to `src/`, `examples/northstar-ledger/`, or `proseproof.policy.yaml` invalidates `C-02`..`C-07` until re-executed and re-sealed.

## Unresolved critical claims

`C-01`, `C-02`, `C-03`, `C-04`, `C-05`, `C-07`, `C-08` (all planned; none executed yet).

## Proof Engine verdict

`UNEXECUTED` (at `EVIDENCE_PLAN` phase).
