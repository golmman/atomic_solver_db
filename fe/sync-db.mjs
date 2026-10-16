// Delivery gate (DECISIONS.md D5): verify sha256 of the proofdb.db delivery
// against fe/delivery.json, then copy it (and the delivery stamp) into the
// served public/ directory.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DELIVERY = join(__dirname, '..', 'data', 'proofdb', 'proofdb.db');
const STAMP = join(__dirname, 'delivery.json');
const PUBLIC_DIR = join(__dirname, 'public');

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

const stamp = JSON.parse(await readFile(STAMP, 'utf8'));

let actual;
try {
  actual = await sha256(DELIVERY);
} catch (err) {
  console.error(`ERROR: cannot read the delivery file: ${DELIVERY}`);
  console.error(err.message);
  console.error('The proofdb.db delivery is required; see docs/plans/redesign/handoff/HANDOFF.md.');
  process.exit(1);
}

if (actual !== stamp.file_sha256) {
  console.error('ERROR: proofdb.db sha256 mismatch.');
  console.error(`  expected (fe/delivery.json): ${stamp.file_sha256}`);
  console.error(`  actual:                       ${actual}`);
  console.error('');
  console.error('A new delivery is recorded deliberately:');
  console.error('  1. place the new file at data/proofdb/proofdb.db');
  console.error('  2. verify it against the producer handoff (sha256 + census),');
  console.error('     see docs/plans/redesign/handoff/HANDOFF.md');
  console.error('  3. update fe/delivery.json with the new stamp (sha256,');
  console.error('     built_from, census) and commit that change.');
  process.exit(1);
}

await mkdir(PUBLIC_DIR, { recursive: true });
await copyFile(DELIVERY, join(PUBLIC_DIR, 'proofdb.db'));
await copyFile(STAMP, join(PUBLIC_DIR, 'delivery.json'));
console.log(`delivery verified (sha256 ${actual.slice(0, 12)}…) and copied to public/`);
