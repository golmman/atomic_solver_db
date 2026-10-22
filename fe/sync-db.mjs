// Drop-in DB delivery uptake (DECISIONS.md D5 as amended by plan6): copy
// data/proofdb/proofdb.db into the served public/ directory. There is no
// pinned delivery stamp; the load gates (schema/invariants/fold digest/
// replay) verify the DB from its own contents at boot.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DELIVERY = join(__dirname, '..', 'data', 'proofdb', 'proofdb.db');
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

let actual;
try {
  actual = await sha256(DELIVERY);
} catch (err) {
  console.error(`ERROR: cannot read the delivery file: ${DELIVERY}`);
  console.error(err.message);
  console.error('The proofdb.db delivery is required; drop it in at that path and re-run.');
  process.exit(1);
}

await mkdir(PUBLIC_DIR, { recursive: true });
await copyFile(DELIVERY, join(PUBLIC_DIR, 'proofdb.db'));
console.log(`delivery copied to public/ (sha256 ${actual.slice(0, 12)}…)`);
