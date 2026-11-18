import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import yazl from 'yazl';
import YAML from 'yaml';
import { unzipTo } from '../evidence/pack.js';
import { validatePack } from '../runner/kane.js';
import { ensureDir, listFiles, rmrf, readText, writeText } from '../util/fsx.js';

const TEXT_EXT = new Set(['.yaml', '.yml', '.json', '.ndjson', '.log', '.md', '.har', '.txt', '.html', '.css', '.js']);
const TOKEN = /\b(?:sk|pk|fm|fe|fw)_[A-Za-z0-9._-]{12,}\b/g;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redaction is field- and identity-based on purpose. Rewriting every email-shaped
 * string would also rewrite the demo credentials inside a test definition and break
 * the pack's sealed definition hash.
 */
function redactText(text, literals = []) {
  let output = text;
  let count = 0;
  output = output.replace(/^(\s*)(user_name|user_email|org_id|project_id|folder_id|test_id|testcase_id|session_id|session_name|sharable_link|share_url):\s*.*$/gm, (match, space, key) => {
    count += 1;
    return `${space}${key}: redacted`;
  });
  output = output.replace(/"(user_name|user_email|org_id|project_id|folder_id|test_id|testcase_id|session_id|session_name|sharable_link|share_url)"\s*:\s*"[^"]*"/g, (match, key) => {
    count += 1;
    return `"${key}":"redacted"`;
  });
  output = output.replace(/https:\/\/test-manager\.lambdatest\.com\/[^\s"'\\)]+/g, () => {
    count += 1;
    return 'https://test-manager.lambdatest.com/redacted';
  });
  for (const literal of literals.filter(Boolean)) {
    output = output.replace(new RegExp(escapeRegExp(literal), 'g'), () => {
      count += 1;
      return '[redacted]';
    });
  }
  output = output.replace(TOKEN, () => { count += 1; return '[redacted-token]'; });
  return { output, count };
}

function copyTree(sourceDir, destDir) {
  for (const file of listFiles(sourceDir)) {
    const relative = path.relative(sourceDir, file);
    const target = path.join(destDir, relative);
    ensureDir(path.dirname(target));
    fs.copyFileSync(file, target);
  }
}

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(outPath));
    const zip = new yazl.ZipFile();
    const files = listFiles(sourceDir);
    for (const file of files) {
      const relative = path.relative(sourceDir, file).split(path.sep).join('/');
      zip.addFile(file, relative);
    }
    zip.outputStream
      .pipe(fs.createWriteStream(outPath))
      .on('close', () => resolve(outPath))
      .on('error', reject);
    zip.end();
  });
}

export async function redactPack({ packPath, outPath, rootDir, workDir, literals = [], validate = true }) {
  const temp = workDir || path.join(path.dirname(outPath), '.redact-work');
  rmrf(temp);
  ensureDir(temp);
  if (fs.statSync(packPath).isDirectory()) copyTree(packPath, temp);
  else await unzipTo(packPath, temp);

  let total = 0;
  const touched = [];
  for (const file of listFiles(temp)) {
    if (!TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
    const text = readText(file, '');
    if (!text) continue;
    const { output, count } = redactText(text, literals);
    if (count > 0) {
      writeText(file, output);
      total += count;
      touched.push(path.relative(temp, file).split(path.sep).join('/'));
    }
  }

  const redefined = resealDefinitions(temp);

  await zipDirectory(temp, outPath);
  rmrf(temp);

  const validation = validate
    ? await validatePack(outPath, { cwd: rootDir, profile: 'L1' }).catch((error) => ({
        code: 1,
        report: { valid: false, status: 'unvalidated', error: error.message },
      }))
    : { code: 0, report: { valid: null, status: 'not-requested' } };
  return {
    outPath,
    redactions: total,
    touched,
    resealed: redefined,
    validation: validation.report,
    validationExit: validation.code,
  };
}

/**
 * A redacted test.md no longer hashes to the value recorded when Kane sealed the
 * pack. Recompute the definition hash so the redacted copy still passes L1
 * validation; the content change is the documented redaction itself.
 */
function resealDefinitions(packDir) {
  const testsDir = path.join(packDir, 'tests');
  if (!fs.existsSync(testsDir)) return [];
  const updated = [];
  for (const entry of fs.readdirSync(testsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(testsDir, entry.name);
    const definition = path.join(dir, 'test.md');
    const resultFile = path.join(dir, 'result.yaml');
    if (!fs.existsSync(definition) || !fs.existsSync(resultFile)) continue;
    const record = YAML.parse(readText(resultFile, '')) || {};
    const content = fs.readFileSync(definition);
    const digest = `sha256:${createHash('sha256').update(content).digest('hex')}`;
    if (record.definition?.sha256 === digest) continue;
    record.definition = { ...(record.definition || {}), path: 'test.md', sha256: digest };
    writeText(resultFile, YAML.stringify(record));
    updated.push(`${entry.name}/result.yaml`);
  }
  return updated;
}

export { redactText };
