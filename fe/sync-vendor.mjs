// Copy the sql.js dist files needed in the browser into public/vendor/.
// Deterministic copy at start time; no CDN fetch (DECISIONS.md D2).
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'node_modules', 'sql.js', 'dist');
const DEST = join(__dirname, 'public', 'vendor', 'sqljs');

const FILES = ['sql-wasm.js', 'sql-wasm.wasm'];

await mkdir(DEST, { recursive: true });
for (const file of FILES) {
  await copyFile(join(DIST, file), join(DEST, file));
}
console.log('vendored sql.js dist into public/vendor/sqljs/');
