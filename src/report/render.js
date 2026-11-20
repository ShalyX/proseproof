function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<mark>$1</mark>').replace(/`([^`]+)`/g, '<mark>$1</mark>');
}

function statusClass(item) {
  if (item.status === 'PROVEN' || item.status === 'HEALED') return 'is-proven';
  if (item.classification === 'DOC_DRIFT') return 'is-drift';
  if (item.classification === 'APP_BUG') return 'is-bug';
  return 'is-unknown';
}

function badgeLabel(item) {
  if (item.status === 'PROVEN') return 'PROVEN';
  if (item.status === 'HEALED') return 'HEALED';
  if (item.classification === 'DOC_DRIFT') return 'DOC DRIFT';
  if (item.classification === 'APP_BUG') return 'APP BUG';
  if (item.classification === 'PLATFORM_ERROR') return 'HARNESS';
  return 'UNVERIFIABLE';
}

function dateLabel(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function duration(ms) {
  if (!ms && ms !== 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function gateRows(report) {
  const gates = report.policy?.gates || [];
  if (!gates.length) return '<p class="muted">Policy verdict recorded without gate detail.</p>';
  return `<table class="gates"><thead><tr><th>Gate</th><th>Metric</th><th>Expected</th><th>Actual</th><th>Status</th></tr></thead><tbody>
  ${gates.map((gate) => `<tr>
    <td><code>${escapeHtml(gate.id)}</code></td>
    <td>${escapeHtml(gate.metric || gate.expr || '')}</td>
    <td>${escapeHtml(gate.op ? `${gate.op} ${JSON.stringify(gate.expected)}` : 'expression')}</td>
    <td>${escapeHtml(JSON.stringify(gate.actual))}</td>
    <td><span class="pill ${gate.status === 'pass' ? 'is-proven' : gate.status === 'warn' ? 'is-drift' : 'is-bug'}">${escapeHtml(gate.status)}</span></td>
  </tr>`).join('')}
  </tbody></table>`;
}

function claimRow(item) {
  const cls = statusClass(item);
  const screenshot = item.screenshot
    ? `<img class="shot" src="shots/${escapeHtml(item.screenshot)}" alt="Real Chrome screenshot for ${escapeHtml(item.claimId)}" loading="lazy">`
    : '<div class="shot shot-empty">no capture</div>';

  const network = (item.evidence?.network || []).filter((line) => line.status >= 400).slice(0, 4);
  const consoleLines = (item.evidence?.console || []).slice(0, 4);

  return `<details class="claim ${cls}">
  <summary>
    <span class="claim-index">${escapeHtml(item.claimId || '—')}</span>
    <span class="claim-main">
      <span class="claim-meta">
        <code class="cite">${escapeHtml(item.location || 'README.md')}</code>
        <span class="pill ${cls}">${badgeLabel(item)}</span>
      </span>
      <span class="claim-title">${escapeHtml(item.title)}</span>
      <span class="claim-quote">${highlight(item.quote || item.promised)}</span>
    </span>
    <span class="claim-thumb">${screenshot}</span>
  </summary>
  <div class="claim-detail">
    <div class="detail-grid">
      <div>
        <p class="detail-label">What the docs promised</p>
        <blockquote>${highlight(item.quote || item.promised)}</blockquote>
        <p class="detail-label">Verdict</p>
        <p class="verdict-line"><span class="pill ${cls}">${badgeLabel(item)}</span> ${escapeHtml(item.reason)}</p>
        ${item.observed ? `<p class="detail-label">Observed in Chrome</p><p class="observed">“${escapeHtml(item.observed)}”</p>` : ''}
      </div>
      <div>
        <p class="detail-label">Kane CLI evidence</p>
        <dl class="evidence-list">
          <div><dt>Classification</dt><dd>${escapeHtml(item.evidence?.kaneCategory || item.classification)}</dd></div>
          ${item.evidence?.httpStatus ? `<div><dt>Network</dt><dd><code>${escapeHtml(item.evidence.httpStatus)}</code> ${escapeHtml(item.evidence.httpUrl || '')}</dd></div>` : ''}
          <div><dt>Steps executed</dt><dd>${escapeHtml(item.evidence?.steps ?? '—')}</dd></div>
          <div><dt>Confidence</dt><dd>${item.confidence ? Math.round(item.confidence * 100) + '%' : '—'}</dd></div>
        </dl>
        ${network.length ? `<p class="detail-label">Failing requests</p><ul class="log">${network.map((line) => `<li><span class="code-red">${escapeHtml(line.status)}</span> ${escapeHtml(line.method)} ${escapeHtml(line.url)}</li>`).join('')}</ul>` : ''}
        ${consoleLines.length ? `<p class="detail-label">Console</p><ul class="log">${consoleLines.map((line) => `<li>${escapeHtml(line.text)}</li>`).join('')}</ul>` : ''}
        ${item.evidence?.kaneSuggestion ? `<p class="detail-label">Kane suggested repair</p><p class="muted">${escapeHtml(item.evidence.kaneSuggestion)}</p>` : ''}
      </div>
    </div>
  </div>
</details>`;
}

function timeline(report) {
  const heal = report.heal;
  if (!heal) return '';
  const steps = heal.steps || [];
  return `<section class="section" id="loop">
  <div class="section-head"><span class="num">02</span><h2>The closed loop</h2><p>Kane’s failure evidence drove a real agent patch, then Kane re-checked the truth.</p></div>
  <ol class="timeline">
    ${steps.map((step) => `<li class="tl-${escapeHtml(step.state || 'done')}">
      <span class="tl-dot"></span>
      <div>
        <p class="tl-title">${escapeHtml(step.title)}</p>
        <p class="tl-detail">${escapeHtml(step.detail || '')}</p>
        ${step.code ? `<pre class="tl-code">${escapeHtml(step.code)}</pre>` : ''}
      </div>
    </li>`).join('')}
  </ol>
  ${heal.guard ? `<div class="guard-card ${heal.guard.rejected ? 'is-proven' : 'is-bug'}">
    <p class="detail-label">Anti-cheat guard self-test</p>
    <p><strong>${heal.guard.rejected ? 'Rejected' : 'FAILED TO REJECT'}</strong> ${escapeHtml(heal.guard.description)}</p>
    ${(heal.guard.violations || []).map((v) => `<p class="muted"><code>${escapeHtml(v.code)}</code> ${escapeHtml(v.message)}</p>`).join('')}
  </div>` : ''}
</section>`;
}

function diffSection(report) {
  if (!report.diff) return '';
  const lines = String(report.diff).split('\n').slice(0, 160);
  return `<section class="section" id="diff">
  <div class="section-head"><span class="num">03</span><h2>The repair</h2><p>Exact diff the agent applied after the guard confirmed every promise survived.</p></div>
  <pre class="diff">${lines.map((line) => {
    const cls = line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : line.startsWith('@@') ? 'hunk' : '';
    return `<span class="${cls}">${escapeHtml(line)}</span>`;
  }).join('\n')}</pre>
</section>`;
}

export function renderReport(report, { liveReload = false } = {}) {
  const summary = report.summary || { total: 0, proven: 0, lied: 0, drifted: 0, unverifiable: 0 };
  const pass = String(report.policy?.result || 'fail') === 'pass';
  let headline;
  if (pass) headline = 'Docs shouldn’t lie.<br><em>Now they don’t.</em>';
  else if (summary.lied && summary.drifted) headline = 'Two promises failed.<br><em>Not for the same reason.</em>';
  else if (summary.lied) headline = 'The docs were right.<br><em>The app wasn’t.</em>';
  else if (summary.drifted) headline = 'Docs shouldn’t lie.<br><em>This one did.</em>';
  else headline = 'Docs shouldn’t lie.<br><em>This run proves it.</em>';

  const parts = [];
  if (summary.lied) parts.push(`${summary.lied} app bug${summary.lied === 1 ? '' : 's'}`);
  if (summary.drifted) parts.push(`${summary.drifted} documentation drift${summary.drifted === 1 ? '' : 's'}`);
  if (summary.platform) parts.push(`${summary.platform} harness failure${summary.platform === 1 ? '' : 's'} (not a lie)`);
  if (summary.unverifiable) parts.push(`${summary.unverifiable} unverifiable`);
  const found = parts.join(', ').replace(/, ([^,]*)$/, ' and $1');

  const lede = pass
    ? `Every documented promise passed in real Chrome. ${summary.proven} of ${summary.total} claims verified against ${escapeHtml(report.url)} with a sealed Kane CLI evidence pack.`
    : `${summary.proven} of ${summary.total} documented promises survived real Chrome${found ? `. Caught: ${found}` : ''}.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pass ? 'Proven' : 'Caught'} · ProseProof Truth Report</title>
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/">
    <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 6.5h13.5M4 14h9M4 21.5h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m16.5 19.5 3.2 3.2 6-7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    ProseProof
  </a>
  <nav><a href="#sheet">Claims</a><a href="#loop">Loop</a><a href="#evidence">Evidence</a></nav>
  <span class="kane-chip"><span class="dot"></span>Kane CLI ${escapeHtml(report.kaneVersion ? report.kaneVersion.replace(/^v/, '') : '')}</span>
</header>

<main>
<section class="hero">
  <div class="hero-main">
    <p class="eyebrow">Truth report <span>·</span> ${dateLabel(report.createdAt)} <span>·</span> real Chrome</p>
    <h1>${headline}</h1>
    <p class="lede">${lede}</p>
    <dl class="hero-meta">
      <div><dt>Target</dt><dd>${escapeHtml(report.url)}</dd></div>
      <div><dt>Docs</dt><dd>${(report.docs || []).map((doc) => `<code>${escapeHtml(doc)}</code>`).join(' ')}</dd></div>
      <div><dt>Runtime</dt><dd>${duration(report.durationMs)} <span class="sep">·</span> ${report.credits ?? '—'} credits</dd></div>
    </dl>
  </div>
  <aside class="verdict-card ${pass ? 'is-pass' : 'is-fail'}">
    <p class="v-label">Kane policy verdict</p>
    <p class="v-word">${pass ? 'PASS' : 'FAIL'}</p>
    <p class="v-policy">${escapeHtml(report.policy?.id || 'proseproof-truth-gate')}</p>
    <div class="tally">
      <div><span class="n">${summary.proven}</span><span class="t">proven</span></div>
      <div><span class="n red">${summary.lied}</span><span class="t">app bugs</span></div>
      <div><span class="n amber">${summary.drifted}</span><span class="t">drift</span></div>
      <div><span class="n muted">${summary.unverifiable + (summary.platform || 0)}</span><span class="t">unjudged</span></div>
    </div>
    <p class="v-note">${pass ? 'Every claim survived a real browser run.' : 'A documented promise is not true until Chrome agrees.'}${summary.platform ? ` ${summary.platform} run${summary.platform === 1 ? '' : 's'} could not be judged because Kane's harness failed; not counted as a lie.` : ''}</p>
  </aside>
</section>

<section class="section" id="sheet">
  <div class="section-head"><span class="num">01</span><h2>The redline sheet</h2><p>Each numbered promise is lifted from the docs with a line citation, then checked in Chrome. Open a row for the evidence.</p></div>
  <div class="sheet-head"><span>Claim</span><span>Promise &amp; verdict</span><span>Chrome</span></div>
  <div class="claims">
    ${(report.claims || []).map(claimRow).join('\n')}
  </div>
</section>

${timeline(report)}
${diffSection(report)}

<section class="section" id="evidence">
  <div class="section-head"><span class="num">${report.heal ? '04' : '02'}</span><h2>Sealed evidence</h2><p>Kane CLI writes a tamper-evident <code>.evidence</code> pack for every run. ProseProof judges the pack with a CEL-style policy and keeps the proof inspectable.</p></div>
  <div class="evidence-grid">
    <div class="evidence-card">
      <p class="detail-label">Policy gates</p>
      ${gateRows(report)}
    </div>
    <div class="evidence-card">
      <p class="detail-label">Pack</p>
      <dl class="evidence-list">
        <div><dt>Evidence ID</dt><dd><code>${escapeHtml(report.evidence?.id || '—')}</code></dd></div>
        <div><dt>Pack</dt><dd><code>${escapeHtml(report.evidence?.packPath || '—')}</code></dd></div>
        <div><dt>Integrity</dt><dd>${report.evidence?.validation?.valid ? '<span class="pill is-proven">L1 VALID</span>' : '<span class="pill is-unknown">UNVALIDATED</span>'}</dd></div>
        <div><dt>Tests sealed</dt><dd>${escapeHtml((report.evidence?.tests || []).length)}</dd></div>
      </dl>
      <p class="detail-label" style="margin-top:22px">Reproduce</p>
      <pre class="cmd">node bin/proseproof.js check --docs ${escapeHtml((report.docs || ['README.md'])[0])} --url ${escapeHtml(report.url)}</pre>
    </div>
  </div>
</section>

<footer>
  <span class="brand small">
    <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 6.5h13.5M4 14h9M4 21.5h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m16.5 19.5 3.2 3.2 6-7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    ProseProof
  </span>
  <p>Docs shouldn’t lie. Prove them in Chrome.</p>
  <p class="muted">Report ${escapeHtml(report.id)} · generated ${escapeHtml(report.createdAt)}</p>
</footer>
</main>
${liveReload ? `<script>new EventSource('/events').addEventListener('reload', () => location.reload());</script>` : ''}
</body>
</html>`;
}

const CSS = `
:root{
  --paper:#FAF8F4; --card:#FFFFFF; --ink:#141619; --muted:#5B606B; --faint:#8A8F98;
  --line:#E4E0D8; --line-strong:#CFC9BD;
  --cobalt:#1D4ED8; --cobalt-soft:#EEF2FF;
  --emerald:#0F766E; --emerald-soft:#E9F5F1;
  --crimson:#BE123C; --crimson-soft:#FBEFF1;
  --amber:#B45309; --amber-soft:#FBF2E4;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:"Inter","Segoe UI Variable","Segoe UI",system-ui,-apple-system,sans-serif;
  --mono:"JetBrains Mono","Cascadia Code",Consolas,"SF Mono",monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;
  background-image:radial-gradient(rgba(20,22,25,.028) .6px, transparent .6px);background-size:22px 22px;}
a{color:inherit;text-decoration:none}
code,pre{font-family:var(--mono);font-size:.86em}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:28px;padding:16px 40px;background:rgba(250,248,244,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:9px;font-weight:650;letter-spacing:-.02em;font-size:17px}
.brand svg{width:26px;height:26px;color:var(--cobalt)}
.brand.small{font-size:15px}
.topbar nav{display:flex;gap:22px;margin-left:auto;font-size:13.5px;color:var(--muted)}
.topbar nav a:hover{color:var(--ink)}
.kane-chip{display:inline-flex;align-items:center;gap:8px;padding:5px 11px;border:1px solid var(--line-strong);border-radius:999px;font-size:12px;color:var(--muted);background:var(--card)}
.kane-chip .dot{width:6px;height:6px;border-radius:50%;background:var(--emerald)}
main{max-width:1120px;margin:0 auto;padding:0 40px}
.hero{display:grid;grid-template-columns:1fr 340px;gap:56px;align-items:end;padding:76px 0 60px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:0 0 22px}
.eyebrow span{margin:0 8px;color:var(--line-strong)}
h1{font-family:var(--serif);font-weight:400;font-size:clamp(44px,6vw,74px);line-height:1.02;letter-spacing:-.035em;margin:0 0 26px}
h1 em{font-style:italic;color:var(--cobalt)}
.lede{font-size:18px;line-height:1.62;color:var(--muted);max-width:56ch;margin:0 0 36px}
.hero-meta{display:flex;flex-wrap:wrap;gap:34px;margin:0}
.hero-meta div{display:flex;flex-direction:column;gap:3px}
.hero-meta dt{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.hero-meta dd{margin:0;font-size:13.5px}
.hero-meta .sep{margin:0 6px;color:var(--line-strong)}
.verdict-card{border:1px solid var(--ink);background:var(--card);padding:26px 26px 22px;position:relative}
.verdict-card::before{content:"";position:absolute;inset:5px;border:1px solid var(--line);pointer-events:none}
.verdict-card.is-fail{border-color:var(--crimson)}
.verdict-card.is-pass{border-color:var(--emerald)}
.v-label{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:0 0 14px}
.v-word{font-family:var(--serif);font-size:58px;line-height:1;margin:0;letter-spacing:-.02em}
.is-fail .v-word{color:var(--crimson)}.is-pass .v-word{color:var(--emerald)}
.v-policy{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin:8px 0 22px}
.tally{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;border-top:1px solid var(--line);padding-top:18px}
.tally div{display:flex;flex-direction:column}
.tally .n{font-family:var(--serif);font-size:26px;line-height:1}
.tally .t{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-top:5px}
.red{color:var(--crimson)}.amber{color:var(--amber)}.muted{color:var(--muted)}
.v-note{font-size:12.5px;color:var(--muted);margin:20px 0 0;border-top:1px solid var(--line);padding-top:14px}
.section{padding:64px 0;border-bottom:1px solid var(--line)}
.section-head{display:grid;grid-template-columns:44px 1fr;gap:0 18px;margin-bottom:34px}
.section-head .num{font-family:var(--mono);font-size:12px;color:var(--faint);padding-top:9px}
.section-head h2{font-family:var(--serif);font-weight:400;font-size:38px;letter-spacing:-.02em;margin:0 0 6px}
.section-head p{grid-column:2;margin:0;color:var(--muted);max-width:68ch;font-size:14.5px}
.sheet-head{display:grid;grid-template-columns:86px 1fr 250px;gap:18px;padding:0 18px 10px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);border-bottom:1px solid var(--line-strong)}
.claim{border-bottom:1px solid var(--line);background:transparent}
.claim[open]{background:var(--card);border:1px solid var(--line);border-bottom:1px solid var(--line);margin:10px 0}
.claim summary{display:grid;grid-template-columns:86px 1fr 250px;gap:18px;align-items:center;padding:18px;cursor:pointer;list-style:none}
.claim summary::-webkit-details-marker{display:none}
.claim:hover summary{background:rgba(255,255,255,.62)}
.claim-index{font-family:var(--mono);font-size:12px;color:var(--faint)}
.claim-main{display:flex;flex-direction:column;gap:5px;min-width:0}
.claim-meta{display:flex;align-items:center;gap:10px;margin-bottom:2px}
.cite{font-size:10.5px;color:var(--muted);background:var(--paper);border:1px solid var(--line);padding:2px 7px;border-radius:3px}
.claim-title{font-weight:600;font-size:16.5px;letter-spacing:-.01em}
.claim-quote{color:var(--muted);font-size:13.5px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
mark{background:linear-gradient(transparent 52%, #F6E3A8 52%);color:inherit;padding:0 1px}
.pill{display:inline-flex;align-items:center;font-family:var(--mono);font-size:10px;letter-spacing:.08em;padding:3px 7px;border:1px solid;border-radius:2px;white-space:nowrap}
.pill.is-proven{color:var(--emerald);border-color:#BFDCD4;background:var(--emerald-soft)}
.pill.is-bug{color:var(--crimson);border-color:#EEC4CD;background:var(--crimson-soft)}
.pill.is-drift{color:var(--amber);border-color:#EBD3AC;background:var(--amber-soft)}
.pill.is-unknown{color:var(--muted);border-color:var(--line-strong);background:var(--paper)}
.claim-thumb{justify-self:end}
.shot{display:block;width:250px;height:146px;object-fit:cover;object-position:top;border:1px solid var(--line-strong);background:#fff;filter:saturate(.92)}
.shot-empty{display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--faint)}
.claim-detail{padding:6px 24px 28px 104px}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:44px}
.detail-label{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:20px 0 8px}
.claim-detail blockquote{margin:0;padding:0 0 0 16px;border-left:2px solid var(--line-strong);font-family:var(--serif);font-size:19px;line-height:1.45}
.verdict-line{font-size:14px;color:var(--muted);margin:0}
.observed{font-family:var(--mono);font-size:13px;color:var(--crimson);margin:0}
.evidence-list{margin:0;display:flex;flex-direction:column;gap:8px}
.evidence-list div{display:grid;grid-template-columns:120px 1fr;gap:12px;font-size:13px}
.evidence-list dt{color:var(--faint);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding-top:2px}
.evidence-list dd{margin:0;word-break:break-word;overflow-wrap:anywhere}
.log{margin:0;padding-left:16px;font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.log li{margin-bottom:4px;word-break:break-all}
.code-red{color:var(--crimson)}
.timeline{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.timeline li{display:grid;grid-template-columns:26px 1fr;gap:16px;padding:0 0 26px;position:relative}
.timeline li::before{content:"";position:absolute;left:6px;top:16px;bottom:0;width:1px;background:var(--line-strong)}
.timeline li:last-child::before{display:none}
.tl-dot{width:13px;height:13px;margin-top:3px;border-radius:50%;border:2px solid var(--ink);background:var(--paper);position:relative;z-index:1}
.tl-done .tl-dot{background:var(--emerald);border-color:var(--emerald)}
.tl-fail .tl-dot{background:var(--crimson);border-color:var(--crimson)}
.tl-title{margin:0;font-weight:600;font-size:15px}
.tl-detail{margin:3px 0 0;color:var(--muted);font-size:13.5px}
.tl-code{margin:10px 0 0;padding:10px 12px;background:var(--ink);color:#EDEBE6;font-size:11.5px;overflow:auto;border-radius:2px}
.guard-card{margin-top:8px;border:1px solid var(--line-strong);padding:18px 20px;background:var(--card)}
.guard-card.is-proven{border-left:3px solid var(--emerald)}
.guard-card.is-bug{border-left:3px solid var(--crimson)}
.diff{margin:0;padding:20px 22px;background:var(--ink);color:#DCD9D2;font-size:12px;line-height:1.7;overflow:auto;max-height:520px;border-radius:2px}
.diff .add{color:#8EE0C0;display:block}
.diff .del{color:#F2A2B4;display:block}
.diff .hunk{color:#9DB7FF;display:block}
.diff span:not(.add):not(.del):not(.hunk){display:block}
.evidence-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:26px}
.evidence-grid > *{min-width:0}
.evidence-card{border:1px solid var(--line-strong);background:var(--card);padding:22px 24px}
.gates{width:100%;border-collapse:collapse;font-size:12.5px}
.gates th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding:0 8px 8px 0;border-bottom:1px solid var(--line)}
.gates td{padding:9px 8px 9px 0;border-bottom:1px solid var(--line);vertical-align:top}
.gates code{font-size:11px}
.cmd{margin:0;padding:12px 14px;background:var(--paper);border:1px solid var(--line);font-size:11.5px;overflow:auto;white-space:pre-wrap;word-break:break-word}
footer{display:flex;align-items:center;gap:20px;padding:34px 0 60px;font-size:12.5px;color:var(--muted)}
footer .brand{margin-right:6px;color:var(--ink)}
footer p{margin:0}
footer .muted{margin-left:auto;color:var(--faint);font-family:var(--mono);font-size:10.5px}
@media (max-width:900px){
  main{padding:0 20px}.topbar{padding:14px 20px;gap:14px}.topbar nav{display:none}
  .hero{grid-template-columns:1fr;gap:30px;padding:44px 0 40px}
  .detail-grid{grid-template-columns:1fr;gap:10px}
  .claim-detail{padding:6px 18px 24px}
  .sheet-head{display:none}
  .claim summary{grid-template-columns:1fr;gap:10px}
  .claim-index{display:none}.claim-thumb{justify-self:start}
  .shot{width:100%;height:auto;max-height:220px}
  .evidence-grid{grid-template-columns:1fr}
  .gates{display:block;overflow-x:auto}
  .hero-meta dd,.v-policy{overflow-wrap:anywhere}
  body{overflow-x:hidden}
  footer{flex-wrap:wrap}.footer .muted{margin-left:0}
  .section-head{grid-template-columns:1fr}.section-head .num{display:none}.section-head p{grid-column:1}
}
`;
