import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { cpus, platform } from 'node:os';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:4173' },
    seconds: { type: 'string', default: '20' },
    preset: { type: 'string', default: 'balanced' },
    headed: { type: 'boolean', default: false },
    software: { type: 'boolean', default: false },
    output: { type: 'string', default: 'test-results/browser-profile.json' },
  },
});
const seconds = Number(values.seconds);
const url = new URL(values.url);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
  throw new Error('--url must be a website HTTP(S) URL without credentials.');
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 120)
  throw new Error('--seconds must be 10–120.');
if (!['performance', 'balanced', 'quality'].includes(values.preset))
  throw new Error('--preset must be performance, balanced or quality.');
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL,
  headless: !values.headed,
  args: values.software
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url.href);
  await page
    .getByRole('button', { name: 'ENTER TRAINING' })
    .waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  await page.getByLabel('Resolution preset').selectOption(values.preset);
  await page.getByLabel('Adaptive resolution', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await page.locator('.crosshair').waitFor();
  await page.waitForTimeout(5000);
  const gpu = await page
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return debug
        ? String(gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL))
        : 'unavailable';
    });
  const samples: Record<string, number>[] = [];
  console.log(
    `Profiling ${values.preset} for ${seconds}s at 1280×720; renderer: ${gpu}`,
  );
  const start = performance.now();
  let phase = -1;
  while (performance.now() - start < seconds * 1000) {
    const next = Math.floor((performance.now() - start) / 4000) % 3;
    if (next !== phase) {
      await page.keyboard.up('w');
      await page.keyboard.up('s');
      await page.mouse.up({ button: 'left' });
      await page.mouse.up({ button: 'right' });
      if (next === 0) {
        await page.keyboard.down('w');
        await page.mouse.down({ button: 'left' });
      } else if (next === 1) {
        await page.keyboard.down('s');
        await page.mouse.down({ button: 'right' });
        await page.mouse.down({ button: 'left' });
      } else await page.keyboard.press('r');
      phase = next;
    }
    samples.push(
      await page
        .locator('.telemetry')
        .evaluate((element: HTMLElement) =>
          Object.fromEntries(
            Object.entries(element.dataset).map(([key, value]) => [
              key,
              Number(value),
            ]),
          ),
        ),
    );
    await page.waitForTimeout(250);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  if (
    !samples.length ||
    samples.some((sample) => !Number.isFinite(sample.fps) || sample.fps! <= 0)
  )
    throw new Error('Missing performance samples.');
  const report = {
    recordedAt: new Date().toISOString(),
    url: url.origin,
    scenario:
      'one offline training browser; fixed resolution; walk/fire/ADS/reload; rolling telemetry',
    preset: values.preset,
    seconds,
    viewport: { width: 1280, height: 720 },
    headed: values.headed,
    browser: browser.version(),
    renderer: gpu,
    softwareRenderer:
      values.software ||
      /swiftshader|llvmpipe|software|basic render/i.test(gpu),
    host: { platform: platform(), cpu: cpus()[0]?.model },
    averageRollingFps:
      samples.reduce((sum, sample) => sum + sample.fps!, 0) / samples.length,
    minimumRollingLowFps: Math.min(...samples.map((sample) => sample.lowFps!)),
    samples,
  };
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      { ...report, samples: `${samples.length} samples in ${output}` },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
