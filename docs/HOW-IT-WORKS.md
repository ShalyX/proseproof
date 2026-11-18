# How ProseProof works

ProseProof is a truth gate for documentation. It reads the promises a doc makes,
turns each one into a Kane CLI browser test, runs them in real Chrome, and then
decides whether a failure is the product's fault or the document's.

```
README.md ──▶ extract ──▶ compile ──▶ Kane CLI ──▶ evidence pack ──▶ triage
                                                                       │
                                          ┌────────────────────────────┤
                                          ▼                            ▼
                                     APP BUG                      DOC DRIFT
                                          │                            │
                                          └────────▶ agent patch ◀─────┘
                                                          │
                                          anti-cheat guard ──▶ Kane re-run ──▶ policy PASS/FAIL
```

## 1. Extract promises

`src/extractor/extract.js` finds a "Try it" style section in a markdown file and
reads its ordered steps. A step becomes a claim when it has:

- an **action** written as a command (`Click **Export CSV**`) or a quoted phrase,
- an **outcome** that can be observed (`a file named invoices.csv downloads`),
- a source **citation** (`README.md:25`).

Setup lines (install, start, URL, credentials) are collected once and reused by
every claim. A claim keeps its original sentence so the report can quote the doc
back to the reader.

## 2. Compile Kane tests

`src/compiler/compile.js` writes one `_test.md` per claim, in the exact shape Kane
expects: an objective, numbered steps, and explicit assertions. Two rules matter:

- **Quoted UI copy is preserved verbatim.** If the doc says a button is labelled
  `Export CSV`, the test says `"Export CSV"`, not a paraphrase.
- **Sign-in is injected, not repeated.** Claims after the sign-in claim inherit a
  setup step that authenticates first, so every test is independently runnable.

The compiler also writes a Kane policy: every test must run, none may fail, and
every test must contain at least one assertion. That policy is linted through
`kane-cli evidence lint-policy` before a run starts, so a malformed gate fails
fast instead of producing a meaningless verdict.

## 3. Run in real Chrome

`src/runner/kane.js` spawns `kane-cli testrun run` with `--agent`,
`--stream-members`, `--on-failure continue`, and the generated policy. ProseProof
never drives the browser itself: Chrome, the page model, screenshots, and step
logs are all Kane's.

Kane emits NDJSON. Two event families are load-bearing:

- `testrun_member_event` → per-claim `run_end`, including the bug verdict,
- `verdict` → the policy result and the sealed evidence id.

## 4. Read the evidence pack

An `.evidence` file is a zip of `run.yaml`, `tests/<hash>/result.yaml`,
`steps/`, and screenshots. `src/evidence/pack.js` opens it and maps each test
back to its claim using `external_id.test_id` (the directory hash is *not* the
test id).

If one member crashes the browser harness, Kane refuses to seal the suite pack.
ProseProof then reads the **per-member packs** that were sealed and marks the
report as unsealed. A harness crash is never allowed to erase the verdicts of the
tests that did run.

## 5. Triage: three honest outcomes

`src/triage/classify.js` is the product. It reads the failure evidence in this
order:

| Signal | Verdict | Meaning |
| --- | --- | --- |
| test passed | `PROVEN` | Every documented step happened in Chrome. |
| HTTP 4xx/5xx, `api_error`, `network_failure` | `APP_BUG` | A documented flow broke. The doc was right; the app was not. |
| `ui_data_defect`, `objective_contradiction`, wording mismatch | `DOC_DRIFT` | The flow worked, but the shipped copy contradicts the doc. |
| harness crash, CDP/screenshot timeout | `PLATFORM_ERROR` | Kane could not judge. Nothing is proven about the app **or** the doc. |
| anything else | `UNVERIFIABLE` | Not enough signal to blame either side. |

The platform row exists because the first real run of this tool hit it: two
claims failed on `connect_over_cdp` and a screenshot timeout, not on the app.
Calling those lies would have been a false accusation, and this tool exists to
avoid exactly that kind of confident wrong answer.

## 6. Anti-cheat guard

The cheapest way for an agent to make a failing truth gate pass is to delete the
promise. `src/guard/anticheat.js` makes that impossible:

- every claim id in the pre-repair docs must still exist afterwards,
- the claim count may not drop,
- edits may only touch the documentation and the declared source roots.

The guard runs on **every** patch before it is applied, and it runs again as an
explicit self-test on the original docs (`proseproof guard`), which feeds a
synthetic promise-deleting patch through the same code path. The self-test is
labelled as a self-test in the report. It is not a recording of the model
misbehaving.

## 7. Closed loop

`src/healer/heal.js` runs the loop:

1. Kane runs the docs and the policy fails.
2. Triage names each failure and why.
3. The agent receives the claim, the triage decision, the failing requests, and
   the files it may edit. It returns minimal search/replace edits.
4. The guard rejects the patch if a promise disappeared.
5. The patch is applied; a dev server on `--watch` restarts.
6. Kane re-runs the same docs. The report keeps both runs, the diff, and the
   guard decision.

The agent is optional. With no API key, a deterministic recipe handles one class
of repair (align a quoted label with the copy Chrome saw) and refuses everything
else. A refusal is reported as a refusal, never as a fix.

## 8. Truth Console

`src/report/render.js` renders `report.json` into a single self-contained HTML
page: one row per promise with the doc quote, the Kane classification, the
screenshot, and the failing request. Screenshots are served from the run
directory, not inlined. The page has no external fonts or CDNs, so it opens
offline in a judge's browser.

## 9. Redaction

Evidence packs contain Test Manager ids, org ids, session ids, and share links.
`src/redact/redact.js` rewrites those fields in text members, keeps the zip's
structure and screenshots, and then re-validates the pack with
`kane-cli evidence validate --profile L1`. The published pack is the redacted
one, and the report records how many fields were rewritten and whether the pack
still validates.
