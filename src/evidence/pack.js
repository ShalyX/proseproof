import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import YAML from 'yaml';
import { ensureDir, readText, listFiles } from '../util/fsx.js';

export function unzipTo(packPath, destDir) {
  ensureDir(destDir);
  return new Promise((resolve, reject) => {
    yauzl.open(packPath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) return reject(openError);
      zipfile.readEntry();
      zipfile.on('error', reject);
      zipfile.on('entry', (entry) => {
        const name = entry.fileName.replace(/\\/g, '/');
        if (name.endsWith('/')) return zipfile.readEntry();
        const target = path.join(destDir, ...name.split('/'));
        if (!target.startsWith(path.resolve(destDir))) return zipfile.readEntry();
        ensureDir(path.dirname(target));
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            fs.writeFileSync(target, Buffer.concat(chunks));
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => resolve(destDir));
    });
  });
}

function parseYaml(file) {
  const text = readText(file, '');
  if (!text.trim()) return null;
  try {
    return YAML.parse(text);
  } catch {
    return null;
  }
}

function readNdjson(file) {
  return readText(file, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function harErrors(file) {
  const har = parseJsonSafe(file);
  if (!har?.log?.entries) return [];
  const out = [];
  for (const entry of har.log.entries) {
    const status = Number(entry?.response?.status || 0);
    if (status >= 400) {
      out.push({
        status,
        method: entry?.request?.method || 'GET',
        url: entry?.request?.url || '',
        mime: entry?.response?.content?.mimeType || '',
      });
    }
  }
  return out;
}

function parseJsonSafe(file) {
  try {
    return JSON.parse(readText(file, 'null'));
  } catch {
    return null;
  }
}

function consoleErrors(file) {
  return readNdjson(file)
    .filter((line) => {
      const level = String(line.level || line.type || line.kind || '').toLowerCase();
      const text = String(line.text || line.message || line.args?.join?.(' ') || '');
      return level.includes('error') || /\b(uncaught|typeerror|referenceerror|failed to load|500)/i.test(text);
    })
    .map((line) => ({
      level: line.level || line.type || 'error',
      text: String(line.text || line.message || line.args?.join?.(' ') || '').slice(0, 500),
    }));
}

function claimIdFromTest(testMd) {
  const match = /proseproof:claim=(N-\d+)/.exec(testMd);
  return match ? match[1] : null;
}

function pickScreenshot(testDir) {
  const stepDirs = fs.existsSync(path.join(testDir, 'steps'))
    ? fs.readdirSync(path.join(testDir, 'steps'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => {
          const na = Number(a.split('-')[0]);
          const nb = Number(b.split('-')[0]);
          return na - nb;
        })
    : [];
  for (let index = stepDirs.length - 1; index >= 0; index -= 1) {
    const dir = path.join(testDir, 'steps', stepDirs[index]);
    for (const name of ['annotated.png', 'screenshot.jpg', 'screenshot.png']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function readPack(packDir) {
  const run = parseYaml(path.join(packDir, 'run.yaml')) || {};
  const rootFailure = parseYaml(path.join(packDir, 'failure.yaml')) || {};
  const testsRoot = path.join(packDir, 'tests');
  const testDirs = fs.existsSync(testsRoot)
    ? fs.readdirSync(testsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  const tests = [];
  for (const dirName of testDirs) {
    const testDir = path.join(testsRoot, dirName);
    const result = parseYaml(path.join(testDir, 'result.yaml')) || {};
    const testMd = readText(path.join(testDir, 'test.md'), '');
    const claimId = claimIdFromTest(testMd);
    const steps = Array.isArray(result.steps) ? result.steps : [];
    const failedStep = [...steps].reverse().find((step) => step.status === 'failed');

    const failureFiles = listFiles(path.join(testDir, 'steps'), (file) => file.endsWith('failure.yaml'));
    let failure = null;
    for (const file of failureFiles) {
      const parsed = parseYaml(file);
      if (parsed && (!failedStep || parsed.step === failedStep.id)) {
        failure = { ...parsed, file };
      }
    }
    if (!failure && failureFiles.length) {
      failure = { ...parseYaml(failureFiles[failureFiles.length - 1]), file: failureFiles[failureFiles.length - 1] };
    }

    const networkRef = failure?.network_at_failure?.ref;
    const consoleRef = failure?.console_at_failure?.ref;
    const network = networkRef ? harErrors(path.join(testDir, networkRef)) : [];
    const consoleLines = consoleRef ? consoleErrors(path.join(testDir, consoleRef)) : [];

    tests.push({
      dirName,
      testId: result.external_id?.test_id || result.test || dirName,
      claimId,
      status: result.status || 'unknown',
      definition: result.definition || null,
      environment: result.environment || {},
      durationMs: result.duration_ms || 0,
      steps,
      failedStepId: failedStep?.id || null,
      failure,
      screenshot: pickScreenshot(testDir),
      network,
      console: consoleLines,
      external: result.external_id || {},
    });
  }

  return {
    run,
    failures: rootFailure.failures || [],
    tests,
    testDir: testsRoot,
  };
}

export function readPackFile(packDir, relative) {
  return readText(path.join(packDir, relative), '');
}
