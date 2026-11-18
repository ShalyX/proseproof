import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  return file;
}

export function writeText(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, value, 'utf8');
  return file;
}

export function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

export function exists(file) {
  return fs.existsSync(file);
}

export function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

export function listFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

export function slugify(value, max = 48) {
  return String(value)
    .toLowerCase()
    .replace(/[`*_~[\]()#]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '') || 'claim';
}

export function relativeTo(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function processAlive(pid) {
  if (!pid || Number.isNaN(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * One suite directory and one Chrome profile cannot serve two runs at once.
 * A stale lock from a killed process is reclaimed instead of blocking forever.
 */
export function acquireRunLock(rootDir, { command = 'check' } = {}) {
  const file = path.join(rootDir, '.proseproof', 'run.lock');
  const held = readJson(file, null);
  if (held && processAlive(held.pid)) {
    throw new Error(
      `A ${held.command || 'proseproof'} run is already in progress (pid ${held.pid}, started ${held.startedAt}). ` +
        'Wait for it or remove .proseproof/run.lock if that process is gone.',
    );
  }
  writeJson(file, { pid: process.pid, command, startedAt: new Date().toISOString() });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = readJson(file, null);
    if (!current || Number(current.pid) === process.pid) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* already gone */
      }
    }
  };
}

export function timestampId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}
