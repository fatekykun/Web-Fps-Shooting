import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
for (const [label, endpoint, shouldPass] of [
  ['missing server URL', '', false],
  ['local server URL', 'http://127.0.0.1:2567', false],
  ['public HTTPS configuration', 'https://rooms.example', true],
] as const) {
  const result = spawnSync(
    process.execPath,
    [vite, 'build', '--outDir', resolve(root, '.deploy/public-build')],
    {
      cwd: resolve(root, 'apps/client'),
      encoding: 'utf8',
      env: { ...process.env, VERCEL: '1', VITE_SERVER_URL: endpoint },
    },
  );
  if ((result.status === 0) !== shouldPass)
    throw new Error(
      `${label}: unexpected build result.\n${result.stdout}\n${result.stderr}`,
    );
  if (
    !shouldPass &&
    !/VITE_SERVER_URL|Public deployments require/.test(result.stderr)
  )
    throw new Error(`Build failed for an unrelated reason: ${result.stderr}`);
  console.log(
    `PASS: ${label} ${shouldPass ? 'builds' : 'is refused before deployment'}.`,
  );
}
console.log(
  'Public build configuration verified. The example endpoint is a build fixture, not a live service.',
);
