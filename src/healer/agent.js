import fs from 'node:fs';
import path from 'node:path';

export function agentConfig() {
  const provider = (process.env.PROSEPROOF_AGENT || 'llm').toLowerCase();
  if (provider === 'recipe') return { provider: 'recipe' };
  if (provider === 'cmd') {
    return { provider: 'cmd', command: process.env.PROSEPROOF_AGENT_CMD || '' };
  }
  return {
    provider: 'llm',
    baseUrl: (process.env.PROSEPROOF_LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: process.env.PROSEPROOF_LLM_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.PROSEPROOF_LLM_MODEL || 'gpt-4.1-mini',
    timeoutMs: Number(process.env.PROSEPROOF_LLM_TIMEOUT_MS || 180_000),
  };
}

function systemPrompt() {
  return [
    'You repair repositories so documentation and the running application tell the same truth.',
    'You receive one failed browser claim with real evidence from a Chrome run.',
    'Return a minimal patch as strict JSON only. No prose outside the JSON object.',
    'Rules:',
    '1. Never delete or weaken a documented promise. Keep every claim; you may correct its wording.',
    '2. If the app returns a 5xx or throws, fix the application code.',
    '3. If the app renders different copy than the docs promise, fix the documentation to match the shipped UI.',
    '4. Prefer the smallest edit that makes the documented user outcome true.',
    '5. Use exact search strings copied from the provided files. Each search must occur exactly once.',
    '6. JSON shape: {"diagnosis":"one sentence","edits":[{"file":"relative/path","search":"exact text","replace":"replacement text","reason":"why"}]}',
  ].join('\n');
}

function buildPrompt({ claim, triage, files, attempt, violations }) {
  const parts = [];
  parts.push(`FAILED CLAIM ${claim.id}: ${claim.title}`);
  parts.push(`Documented quote (${claim.location}): ${claim.quote}`);
  parts.push(`Promised outcome: ${claim.expectation}`);
  parts.push(`Kane CLI classification: ${triage.classification} (${Math.round((triage.confidence || 0) * 100)}% confidence)`);
  parts.push(`Diagnosis: ${triage.reason}`);
  if (triage.evidence?.kaneRootCause) parts.push(`Kane root cause: ${triage.evidence.kaneRootCause}`);
  if (triage.evidence?.kaneSuggestion) parts.push(`Kane suggested fix: ${triage.evidence.kaneSuggestion}`);
  if (triage.evidence?.httpStatus) {
    parts.push(`HTTP evidence: ${triage.evidence.httpStatus} from ${triage.evidence.httpUrl}`);
  }
  for (const line of triage.evidence?.network || []) {
    if (line.status >= 400) parts.push(`Network: ${line.method} ${line.url} -> ${line.status}`);
  }
  for (const line of (triage.evidence?.console || []).slice(0, 5)) {
    parts.push(`Console: ${line.text}`);
  }
  if (triage.observed) parts.push(`Observed in Chrome: "${triage.observed}"`);

  parts.push('');
  parts.push('FILES:');
  for (const file of files) {
    parts.push(`--- ${file.path} ---`);
    parts.push(file.content);
    parts.push(`--- end ${file.path} ---`);
  }

  if (attempt > 1) {
    parts.push('');
    parts.push('Your previous patch was rejected by the anti-cheat guard.');
    parts.push('Violations:');
    for (const violation of violations || []) parts.push(`- ${violation.code}: ${violation.message}`);
    parts.push('Repair the real cause and keep every documented promise.');
  }

  parts.push('');
  parts.push('Respond with the JSON object now.');
  return parts.join('\n');
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callLlm({ config, prompt }) {
  if (!config.apiKey) throw new Error('No LLM API key configured. Set PROSEPROOF_LLM_API_KEY or OPENAI_API_KEY, or use --agent recipe.');
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 2200,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent request failed (${response.status}): ${body.slice(0, 400)}`);
  }
  const payload = await response.json();
  const message = payload?.choices?.[0]?.message || {};
  return message.content || message.reasoning_content || '';
}

async function callCommand({ config, prompt }) {
  if (!config.command) throw new Error('PROSEPROOF_AGENT_CMD is not set.');
  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Agent command exited ${code}: ${stderr.slice(0, 400)}`));
      resolve(stdout);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function validateEdits(edits, files) {
  const problems = [];
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  for (const edit of edits) {
    if (!edit.file || typeof edit.search !== 'string' || typeof edit.replace !== 'string') {
      problems.push('Edit is missing file/search/replace.');
      continue;
    }
    const content = byPath.get(edit.file);
    if (typeof content !== 'string') {
      problems.push(`Unknown file: ${edit.file}`);
      continue;
    }
    const first = content.indexOf(edit.search);
    if (first < 0) {
      problems.push(`Search text not found in ${edit.file}: ${edit.search.slice(0, 60)}`);
      continue;
    }
    if (content.indexOf(edit.search, first + 1) >= 0) {
      problems.push(`Search text is ambiguous in ${edit.file}: ${edit.search.slice(0, 60)}`);
    }
  }
  return problems;
}

export async function proposePatch({ claim, triage, files, attempt = 1, violations = [] }) {
  const config = agentConfig();
  if (config.provider === 'recipe') {
    const recipe = recipePatch({ claim, triage, files });
    if (!recipe) {
      return {
        provider: 'recipe',
        edits: [],
        diagnosis: 'No deterministic recipe exists for this failure class.',
        text: '',
        parseError: 'Recipe mode only knows how to align documented copy with shipped copy.',
      };
    }
    return { provider: 'recipe', edits: [recipe], diagnosis: recipe.reason, text: '' };
  }
  const prompt = buildPrompt({ claim, triage, files, attempt, violations });
  const raw = config.provider === 'cmd'
    ? await callCommand({ config, prompt })
    : await callLlm({ config, prompt });

  const parsed = parseJson(raw);
  if (!parsed || !Array.isArray(parsed.edits)) {
    return { provider: config.provider, edits: [], diagnosis: '', text: raw, parseError: 'Agent did not return valid patch JSON.' };
  }
  const problems = validateEdits(parsed.edits, files);
  return {
    provider: config.provider,
    model: config.model || null,
    diagnosis: parsed.diagnosis || '',
    edits: parsed.edits,
    problems,
    text: raw,
  };
}

export function recipePatch({ claim, triage, files }) {
  if (triage.classification !== 'DOC_DRIFT' || !triage.observed) return null;
  const raw = claim.rawExpectation || claim.expectation || '';
  const bold = /\*\*([^*]+)\*\*/.exec(raw);
  const tick = /`([^`]+)`/.exec(raw);
  if (!bold && !tick) return null;
  const promised = bold ? bold[1] : tick[1];
  if (!promised || promised.toLowerCase() === triage.observed.toLowerCase()) return null;
  const search = bold ? `**${promised}**` : `\`${promised}\``;
  const replace = bold ? `**${triage.observed}**` : `\`${triage.observed}\``;
  const doc = files.find((file) => /\.md$/i.test(file.path) && file.content.includes(search));
  if (!doc) return null;
  return {
    file: doc.path,
    search,
    replace,
    reason: `Align the documented label with the shipped copy Chrome observed (“${triage.observed}”).`,
  };
}

export function applyEdits(rootDir, edits) {
  const applied = [];
  for (const edit of edits) {
    const file = path.resolve(rootDir, edit.file);
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(edit.search, edit.replace);
    if (after === before) continue;
    fs.writeFileSync(file, after, 'utf8');
    applied.push({ file: edit.file, reason: edit.reason || '', before, after });
  }
  return applied;
}

export function readFiles(rootDir, entries) {
  const out = [];
  for (const entry of entries) {
    const file = path.resolve(rootDir, entry);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (content.length > 60_000) continue;
    out.push({ path: entry.split(path.sep).join('/'), content });
  }
  return out;
}
