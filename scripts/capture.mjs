#!/usr/bin/env node
/**
 * Deterministic page capture over the Chrome DevTools Protocol.
 *
 * Usage:
 *   node scripts/capture.mjs <url> <out.png> [--width 1440] [--full] [--scale 2]
 *
 * Chrome's `--screenshot` flag cannot make a window narrower than ~500 px on
 * Windows, which silently crops narrow-viewport captures. This script asks the
 * page for its real layout metrics and captures either the exact viewport or the
 * whole document.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url, outFile] = process.argv.slice(2);
if (!url || !outFile) {
  console.error('usage: node scripts/capture.mjs <url> <out.png> [--width N] [--full] [--scale N]');
  process.exit(2);
}

const flags = process.argv.slice(4);
const arg = (name, fallback) => {
  const index = flags.indexOf(name);
  return index === -1 ? fallback : Number(flags[index + 1]);
};
const width = arg('--width', 1440);
const scale = arg('--scale', 2);
const full = flags.includes('--full');

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chrome) {
  console.error('Chrome not found. Set CHROME_PATH to the browser binary.');
  process.exit(1);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proseproof-capture-'));
const browser = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function debuggerUrl() {
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if (fs.existsSync(portFile)) {
        const [port, browserPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
        if (port && browserPath) return `ws://127.0.0.1:${port}${browserPath}`;
      }
    } catch {
      // Chrome is still writing the file; try again.
    }
    await sleep(100);
  }
  throw new Error('Chrome did not expose a debugging port.');
}

const socket = new WebSocket(await debuggerUrl());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', {
  width,
  height: 900,
  deviceScaleFactor: scale,
  mobile: width < 600,
});
await call('Page.navigate', { url });
await new Promise((resolve) => {
  const onMessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.loadEventFired' && message.sessionId === sessionId) {
      socket.removeEventListener('message', onMessage);
      resolve();
    }
  };
  socket.addEventListener('message', onMessage);
});
await sleep(400);

const metrics = await call('Page.getLayoutMetrics');
const content = metrics.cssContentSize || metrics.contentSize;
const clip = full
  ? { x: 0, y: 0, width, height: Math.ceil(content.height), scale: 1 }
  : { x: 0, y: 0, width, height: 900, scale: 1 };
const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, clip });

fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(data, 'base64'));
console.log(`${outFile}  ${width}px wide, ${full ? `${clip.height}px tall` : 'viewport'}  (${scale}x)`);

socket.close();
browser.kill();
// Chrome releases its profile lock asynchronously; a stuck temp dir is not a
// capture failure, so the cleanup is best effort.
await new Promise((resolve) => {
  browser.once('exit', resolve);
  setTimeout(resolve, 2000);
});
try {
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {
  /* the OS cleans the temp dir later */
}
