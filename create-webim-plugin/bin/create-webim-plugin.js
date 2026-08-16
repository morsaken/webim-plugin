#!/usr/bin/env node
// create-webim-plugin — the `npm create webim-plugin <dir>` flow. A thin
// alias: everything lives in the webim-plugin CLI, this just runs its `init`.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('webim-plugin/bin/webim-plugin.js');
const result = spawnSync(process.execPath, [cli, 'init', ...process.argv.slice(2)], { stdio: 'inherit' });

process.exit(result.status ?? 1);
