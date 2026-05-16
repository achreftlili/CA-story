#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (err) => {
    if (err && err.userMessage) {
      process.stderr.write(`castory: ${err.userMessage}\n`);
      process.exit(err.exitCode ?? 1);
    }
    process.stderr.write(`castory: ${err?.stack ?? err}\n`);
    process.exit(1);
  },
);
