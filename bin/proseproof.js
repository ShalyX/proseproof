#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  console.error(`proseproof: ${error.message}`);
  if (process.env.PROSEPROOF_DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
