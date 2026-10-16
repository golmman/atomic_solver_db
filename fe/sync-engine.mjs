// Start-time engine sync (DECISIONS.md D1): the WASM rules engine and its
// wasm-bindgen glue are build artifacts, vendored into
// public/vendor/engine/ (gitignored). npm start runs the build only when
// the vendor output is missing — cargo absence is a hard error with the
// build command, never a silent skip.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // fe/
const vendorDir = join(here, 'public', 'vendor', 'engine');
const glue = join(vendorDir, 'atomic_solver_engine.js');
const wasm = join(vendorDir, 'atomic_solver_engine_bg.wasm');

if (existsSync(glue) && existsSync(wasm)) {
  console.log('engine vendor present — skipping engine build');
  process.exit(0);
}

console.log('engine vendor missing — building (sh engine/build.sh) …');
const result = spawnSync('sh', [join(here, '..', 'engine', 'build.sh')], {
  stdio: 'inherit',
  cwd: here,
});

if (result.error) {
  console.error(
    'error: could not run engine/build.sh (' + result.error.message + ').\n' +
      'Build the engine with: sh engine/build.sh\n' +
      'Prerequisites (see AGENTS.md): cargo, the wasm32-unknown-unknown\n' +
      'target, and wasm-bindgen-cli 0.2.129.'
  );
  process.exit(1);
}
if (result.status !== 0) {
  console.error('error: engine build failed — see output above.');
  process.exit(result.status ?? 1);
}
if (!existsSync(glue) || !existsSync(wasm)) {
  console.error('error: engine build reported success but vendor output is missing.');
  process.exit(1);
}
console.log('engine vendor built and vendored into fe/public/vendor/engine/');
