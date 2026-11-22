# Sealed demo run

- Run: `20261121-205247-heal`
- Recorded: 2026-11-21T19:59:25.951Z
- Kane CLI: 0.10.5
- Target: http://localhost:4177
- Docs: examples/northstar-ledger/README.md
- Policy: **PASS** (proseproof-truth-gate)
- Claims: 5/5 proven · 0 app bug(s) · 0 drift · 0 harness failure(s)
- Redacted packs: 1 · L1 valid

This directory is a committed snapshot so a judge can inspect the report without running
Kane CLI or Chrome. Screenshots are the real browser captures from that run. Identity
fields inside the evidence packs were rewritten before publication; the packs still pass
`kane-cli evidence validate --profile L1`.

Serve it with:

```bash
node bin/proseproof.js demo
```

Or open `index.html` in this directory directly: it is a self-contained snapshot with
no server, no CDN, and no JavaScript beyond the optional live-reload hook.
