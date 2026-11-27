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
    look: { type: 'boolean', default: false },
    shadows: { type: 'string', default: 'off' },
    aa: { type: 'string', default: 'off' },
    screenshot: { type: 'boolean', default: false },
    weapon: { type: 'string', default: 'rifle' },
    scenario: { type: 'string', default: 'combat' },
    output: { type: 'string', default: 'test-results/browser-profile.json' },
  },
});
const seconds = Number(values.seconds);
if (!['combat', 'sprint'].includes(values.scenario))
  throw new Error('--scenario must be combat or sprint.');
const weaponKeys: Record<string, string> = {
  rifle: '1',
  smg: '2',
  shotgun: '3',
  sniper: '4',
};
if (!weaponKeys[values.weapon])
  throw new Error('--weapon must be rifle, smg, shotgun or sniper.');
const url = new URL(values.url);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
  throw new Error('--url must be a website HTTP(S) URL without credentials.');
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 120)
  throw new Error('--seconds must be 10–120.');
if (
  !['performance', 'balanced', 'quality', 'hd', 'ultra'].includes(values.preset)
)
  throw new Error(
    '--preset must be performance, balanced, quality, hd or ultra.',
  );
if (!['off', 'low', 'high', 'ultra'].includes(values.shadows))
  throw new Error('--shadows must be off, low, high or ultra.');
if (!['off', 'fxaa', 'smaa', 'msaa2', 'msaa4'].includes(values.aa))
  throw new Error('--aa must be off, fxaa, smaa, msaa2 or msaa4.');
const viewport =
  values.preset === 'ultra'
    ? { width: 2560, height: 1440 }
    : values.preset === 'hd'
      ? { width: 1920, height: 1080 }
      : values.preset === 'quality'
        ? { width: 1600, height: 900 }
        : { width: 1280, height: 720 };
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL,
  headless: !values.headed,
  args: values.software
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [],
});
try {
  const page = await browser.newPage({
    viewport,
  });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (values.look)
    await page.addInitScript(() => {
      let sample = 0;
      // Exercise the actual pointer-lock handler at 125 Hz during the profile.
      setInterval(() => {
        if (!document.pointerLockElement) return;
        document.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.sin(++sample * 0.03) * 3,
            movementY: Math.cos(sample * 0.03) * 1.5,
          }),
        );
      }, 8);
    });
  await page.goto(url.href);
  await page
    .getByRole('button', { name: 'ENTER TRAINING' })
    .waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  await page.getByLabel('Resolution preset').selectOption(values.preset);
  await page.getByLabel('Adaptive resolution', { exact: true }).uncheck();
  const aaSelect = page.getByLabel('Anti-aliasing', { exact: true });
  if (await aaSelect.locator(`option[value="${values.aa}"]`).isDisabled())
    throw new Error(
      `Anti-aliasing ${values.aa} is unavailable on this device.`,
    );
  await aaSelect.selectOption(values.aa);
  await page.waitForFunction(
    (mode) =>
      document
        .querySelector('[data-testid="render-resolution"]')
        ?.getAttribute('data-aa-active') === mode,
    values.aa,
  );
  if (await page.getByLabel('Shadow quality', { exact: true }).count())
    await page
      .getByLabel('Shadow quality', { exact: true })
      .selectOption(values.shadows);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await page.locator('.crosshair').waitFor();
  await page.keyboard.press(weaponKeys[values.weapon]!);
  await page.waitForTimeout(500);
  if (values.screenshot)
    await page.screenshot({ path: resolve(values.output + '.png') });
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
    `Profiling ${values.preset} for ${seconds}s at ${viewport.width}×${viewport.height}; renderer: ${gpu}`,
  );
  const start = performance.now();
  let phase = -1;
  while (performance.now() - start < seconds * 1000) {
    const next = Math.floor((performance.now() - start) / 4000) % 3;
    if (next !== phase) {
      await page.keyboard.up('w');
      await page.keyboard.up('s');
      await page.keyboard.up('Shift');
      await page.mouse.up({ button: 'left' });
      await page.mouse.up({ button: 'right' });
      if (next === 0) {
        await page.keyboard.down('w');
        if (values.scenario === 'sprint') await page.keyboard.down('Shift');
        else await page.mouse.down({ button: 'left' });
      } else if (next === 1) {
        await page.keyboard.down('s');
        await page.mouse.down({ button: 'right' });
        await page.mouse.down({ button: 'left' });
      } else await page.keyboard.press('r');
      phase = next;
    }
    // Semi-automatic weapons need fresh trigger presses, including across bolt cycles.
    if (
      values.weapon === 'sniper' &&
      next !== 2 &&
      !(values.scenario === 'sprint' && next === 0)
    ) {
      await page.mouse.up({ button: 'left' });
      await page.mouse.down({ button: 'left' });
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
  const rendering = await page
    .getByTestId('render-resolution')
    .evaluate((element: HTMLElement) => ({
      width: Number(element.dataset.width),
      height: Number(element.dataset.height),
      textureQuality: element.dataset.textureQuality,
      shadowQuality: element.dataset.shadowQuality,
      shadowMapSize: Number(element.dataset.shadowMapSize),
      viewDistance: Number(element.dataset.cameraFar),
      renderScale: Number(element.dataset.renderScale),
      antiAliasing: element.dataset.aaActive,
      supportedAntiAliasing: element.dataset.aaSupported?.split(','),
      samples: Number(element.dataset.aaSamples),
      aaPasses: Number(element.dataset.aaPasses),
    }));
  const report = {
    recordedAt: new Date().toISOString(),
    url: url.origin,
    scenario:
      values.scenario === 'sprint'
        ? 'one offline training browser; fixed resolution; sprint carry/walk ADS fire/idle reload; rolling telemetry'
        : 'one offline training browser; fixed resolution; walk/fire/ADS/reload; rolling telemetry',
    preset: values.preset,
    weapon: values.weapon,
    lookInput: values.look,
    rendering,
    seconds,
    viewport,
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
