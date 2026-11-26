import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const trainingAssets = [
  'favicon.svg',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/breakpoint-192.png',
  'icons/breakpoint-512.png',
  'icons/breakpoint-maskable.png',
  'models/first_person_gloves.glb',
  'models/glacier_fang_knife.glb',
  'models/thumbnails/rifle-standard.webp',
  'models/thumbnails/smg-standard.webp',
  'models/thumbnails/shotgun-standard.webp',
  'models/thumbnails/sniper-standard.webp',
  'audio/ar-01-rifle-shot.wav',
  'audio/sm-02-smg-shot.wav',
  'audio/sg-03-shotgun-shot.wav',
  'audio/sr-04-sniper-shot.wav',
  'audio/breakpoint-hitmarker.wav',
  'audio/breakpoint-headshot.wav',
  'audio/breakpoint-elimination.wav',
];

export function createServiceWorker(): Plugin {
  return {
    name: 'breakpoint-service-worker',
    apply: 'build',
    async writeBundle({ dir }, bundle) {
      if (!dir) throw new Error('The service worker needs a build directory.');
      const paths = [
        ...new Set([
          'index.html',
          ...trainingAssets,
          ...Object.keys(bundle).filter((path) => !path.endsWith('.map')),
        ]),
      ].sort();
      const worker = await readFile(
        new URL('./service-worker.js', import.meta.url),
        'utf8',
      );
      const revision = createHash('sha256').update(worker);
      for (const path of paths)
        revision.update(path).update(await readFile(resolve(dir, path)));
      const models = Object.fromEntries(
        await Promise.all(
          (await readdir(resolve(dir, 'models')))
            .sort()
            .map((name) => `models/${name}`)
            .filter((path) => path.endsWith('.glb') && !paths.includes(path))
            .map(async (path) => [
              path,
              createHash('sha256')
                .update(await readFile(resolve(dir, path)))
                .digest('hex')
                .slice(0, 16),
            ]),
        ),
      );
      revision.update(JSON.stringify(models));
      const build = {
        paths,
        models,
        revision: revision.digest('hex').slice(0, 16),
      };
      await writeFile(
        resolve(dir, 'service-worker.js'),
        `const build = ${JSON.stringify(build)};\n${worker}`,
      );
    },
  };
}
