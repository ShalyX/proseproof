#!/usr/bin/env node
/**
 * Fills the demo-video link into the files that carry a {{VIDEO_URL}} marker.
 *
 *   node scripts/set-video-url.mjs https://youtu.be/xxxxxxxxxxx
 *
 * The marker is deliberate: it fails loudly in review if a post or a submission
 * record is published before the video exists. Only the files listed below are
 * touched, and only when they still contain the marker, so running this twice
 * cannot mangle a link that is already correct.
 */
import fs from 'node:fs';

const url = process.argv[2];
if (!url || !/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+$/.test(url)) {
  console.error('usage: node scripts/set-video-url.mjs https://youtu.be/<id>');
  process.exit(2);
}

const files = ['LAUNCH_POSTS.md', '.hackathon/submission.md', 'README.md', 'site/index.html', 'EVIDENCE.md'];
const marker = '{{VIDEO_URL}}';
let touched = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes(marker)) {
    console.log(`skip  ${file} (no marker)`);
    continue;
  }
  const after = before.split(marker).join(url);
  fs.writeFileSync(file, after, 'utf8');
  const count = before.split(marker).length - 1;
  console.log(`set   ${file} (${count} place${count === 1 ? '' : 's'})`);
  touched += 1;
}

if (!touched) {
  console.log('nothing to do: no marker left in the file list');
}
