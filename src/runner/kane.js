import { spawn } from 'node:child_process';

const ANSI = /\u001b\[[0-9;]*m/g;

function quoteArg(value) {
  const text = String(value);
  return /[\s"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function stripAnsi(value) {
  return String(value).replace(ANSI, '');
}

export function runKane(args, { cwd = process.cwd(), env = {}, timeoutMs = 1_200_000, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'kane-cli' : 'kane-cli';
    const finalArgs = process.platform === 'win32' ? args.map(quoteArg) : args;
    const child = spawn(command, finalArgs, {
      cwd,
      shell: process.platform === 'win32',
      env: { ...process.env, KANE_CLI_USER_AGENT: 'proseproof', NO_COLOR: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let buffer = '';
    const lines = [];
    let timer = null;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdout += text;
      buffer += text;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        lines.push(line);
        if (onLine) {
          try { onLine(line); } catch { /* ignore listener errors */ }
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (buffer.trim()) {
        lines.push(buffer.trim());
        if (onLine) {
          try { onLine(buffer.trim()); } catch { /* ignore */ }
        }
      }
      resolve({ code, stdout, stderr: stripAnsi(stderr), lines });
    });
  });
}

export function parseLines(lines) {
  const events = [];
  for (const line of lines) {
    const text = line.trim();
    if (!text.startsWith('{')) continue;
    try {
      events.push(JSON.parse(text));
    } catch {
      // ignore non-JSON chatter
    }
  }
  return events;
}

export async function kaneJson(args, options = {}) {
  const result = await runKane(args, options);
  const events = parseLines(result.lines);
  const payload = events.length ? events[events.length - 1] : null;
  return { ...result, payload };
}

export function findEvent(events, type) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === type) return events[index];
  }
  return null;
}

export function memberRunEnds(events) {
  const out = [];
  for (const event of events) {
    if (event?.type === 'testrun_member_event' && event.event?.type === 'run_end') {
      out.push({ member: event.member, run: event.event });
    }
  }
  return out;
}

export async function lintPolicy(policyPath, { cwd } = {}) {
  const result = await kaneJson(['evidence', 'lint-policy', policyPath, '--json'], { cwd });
  return { code: result.code, report: result.payload, stderr: result.stderr };
}

export async function judgePack(packPath, policyPath, { cwd } = {}) {
  const result = await kaneJson(
    ['evidence', 'verdict', packPath, '--policy', policyPath, '--json'],
    { cwd, timeoutMs: 240_000 },
  );
  return { code: result.code, report: result.payload, stderr: result.stderr };
}

export async function validatePack(packPath, { cwd, profile = 'L1' } = {}) {
  const result = await kaneJson(
    ['evidence', 'validate', packPath, '--profile', profile, '--json'],
    { cwd, timeoutMs: 240_000 },
  );
  return { code: result.code, report: result.payload, stderr: result.stderr };
}

export async function kaneVersion({ cwd } = {}) {
  const result = await runKane(['--version'], { cwd, timeoutMs: 30_000 });
  return result.stdout.trim() || result.stderr.trim();
}
