// Build helper: emit packages/shared-protocol/dist-cjs/package.json with
// `{ "type": "commonjs" }` so Electron 30 / Node 20 (CJS lookup) can
// `require()` the CJS build, even though the parent package's `type`
// is `module`.
//
// This is invoked from `npm run build` (or `npm run build:cjs`) — it
// runs AFTER `tsc -p tsconfig.cjs.json` so the dist-cjs directory
// already exists. It uses no external dependencies and is safe to run
// from a clean checkout (deleting dist/ and dist-cjs/ + re-running
// `npm run build:shared` must produce a working CJS artifact).
//
// Exit codes:
//   0 — marker written
//   1 — marker could not be written (missing dist-cjs/ or write error)

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(__filename), '..');
const distCjsDir = path.join(packageRoot, 'dist-cjs');
const markerPath = path.join(distCjsDir, 'package.json');

try {
  const stat = await fs.stat(distCjsDir);
  if (!stat.isDirectory()) {
    console.error(`[build-cjs-marker] dist-cjs path is not a directory: ${distCjsDir}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[build-cjs-marker] dist-cjs directory missing (run \`tsc -p tsconfig.cjs.json\` first): ${distCjsDir}`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const marker = {
  type: 'commonjs',
};

try {
  await fs.writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf-8');
  console.log(`[build-cjs-marker] wrote ${markerPath}`);
} catch (err) {
  console.error(`[build-cjs-marker] failed to write marker: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
