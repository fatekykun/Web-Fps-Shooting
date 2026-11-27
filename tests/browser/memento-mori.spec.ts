import { expect, test, type Page } from '@playwright/test';
import { loadoutsWithSkin } from './helpers/loadouts';

// These tests control model requests directly, independently of the offline cache.
test.use({ serviceWorkers: 'block' });

async function trackAudioSamples(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = async function (...args) {
      const buffer = await decode.apply(this, args);
      const data = document.documentElement.dataset;
      data.decodedSamples = `${data.decodedSamples ?? ''},${Math.round(buffer.duration * 1000)}`;
      return buffer;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) {
        const data = document.documentElement.dataset;
        data.playedSamples = `${data.playedSamples ?? ''},${Math.round(this.buffer.duration * 1000)}`;
      }
      start.apply(this, args);
    };
  });
}

async function glowingSightPixels(
  page: Page,
  hipFire = false,
): Promise<number> {
  const frame = await page.locator('canvas').screenshot();
  return page.evaluate(
    async ({ encoded, hip }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const x = hip
        ? Math.floor(image.width * 0.664)
        : Math.floor(image.width / 2) - 2;
      const y = hip
        ? Math.floor(image.height * 0.5)
        : Math.floor(image.height / 2) - 2;
      const width = hip ? Math.round(image.width * 0.109) : 5;
      const height = hip ? Math.round(image.height * 0.085) : 5;
      const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
      ctx.drawImage(image, -x, -y);
      const { data } = ctx.getImageData(0, 0, width, height);
      let pixels = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i]! > 210 && data[i + 1]! > 70 && data[i]! > data[i + 2]! + 60)
          pixels++;
      return pixels;
    },
    { encoded: frame.toString('base64'), hip: hipFire },
  );
}

test('the Memento Mori GLB loads on selection, aligns its optic, and keeps the rifle playable', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', ({ message }) => errors.push(message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/models/memento.glb'))
      requests.push(request.url());
  });
  await trackAudioSamples(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'quality',
        adaptive: false,
        antiAliasing: 'off',
      }),
    ),
  );
  const enter = page.getByRole('button', { name: /^(ENTER|RESUME) TRAINING$/ });
  const hud = page.getByTestId('weapon-status');
  const armory = page.getByRole('button', { name: 'LOADOUTS', exact: true });
  const skin = page.getByLabel('Change Skin');
  const draws = () =>
    page
      .getByTestId('render-resolution')
      .getAttribute('data-world-draws')
      .then(Number);
  await page.goto('/');
  await enter.click();
  await expect(hud).toHaveAttribute('data-rifle-skin', 'standard');
  await expect.poll(draws).toBeGreaterThan(0);
  const baseline = await draws();
  expect(requests).toHaveLength(0);
  await page.keyboard.press('Escape');
  await armory.click();
  await skin.selectOption({ label: 'Memento Mori' });
  await page.getByRole('button', { name: 'Save Loadout' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await enter.click();
  await expect(hud).toHaveAttribute('data-rifle-skin', 'memento-mori');
  await expect(hud).toHaveAttribute('data-rifle-skin-status', 'ready');
  await expect(hud).toContainText('AR-01 / MEMENTO MORI');
  await expect.poll(draws).toBeGreaterThan(baseline);
  expect(await draws()).toBeLessThanOrEqual(baseline + 9);
  expect(requests).toHaveLength(1);
  await expect(page.locator('.crosshair')).toHaveCSS('visibility', 'visible');
  expect(await glowingSightPixels(page, true)).toBeGreaterThan(25);
  await page.screenshot({ path: testInfo.outputPath('memento-hip.png') });

  await page.keyboard.press('i');
  await expect(hud).toHaveAttribute('data-inspecting', 'true');
  await page.waitForTimeout(480);
  await page.screenshot({ path: testInfo.outputPath('memento-inspect.png') });
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveAttribute('data-inspecting', 'false');
  await expect(page.locator('.crosshair')).toHaveCSS('visibility', 'hidden');
  await expect
    .poll(async () => Number(await hud.getAttribute('data-ads')))
    .toBeGreaterThan(0.999);
  expect(await glowingSightPixels(page)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('memento-ads.png') });
  const audio = page.locator('html');
  await expect(audio).toHaveAttribute('data-decoded-samples', /\b339\b/);
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '29');
  await expect(hud).toHaveAttribute('data-hits', '1');
  await expect(audio).toHaveAttribute('data-played-samples', /\b339\b/);
  await expect(audio).not.toHaveAttribute(
    'data-played-samples',
    /\b(192|680)\b/,
  );
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => Number(await hud.getAttribute('data-ads')))
    .toBeLessThan(0.01);
  await expect(page.locator('.crosshair')).toHaveCSS('visibility', 'visible');
  expect(await glowingSightPixels(page, true)).toBeGreaterThan(25);
  await page.keyboard.press('r');
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await expect(hud).toHaveAttribute('data-ammo', '30');
  await page.keyboard.press('2');
  await expect(hud).toHaveAttribute('data-weapon', 'smg');
  await page.keyboard.press('1');
  await expect(hud).toHaveAttribute('data-rifle-skin-status', 'ready');
  expect(requests).toHaveLength(1);
  await page.reload();
  await armory.click();
  await expect(skin).toHaveValue('memento-mori');
  expect(errors).toEqual([]);
});

test.describe('Memento Mori touch controls', () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 844, height: 390 },
    screen: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
  });
  test('a slow skin download skips the standard rifle and supports touch inspect and ADS once ready', async ({
    page,
  }) => {
    let releaseDownload!: () => void;
    const pendingDownload = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });
    await page.route('**/models/memento.glb', async (route) => {
      await pendingDownload;
      await route.continue();
    });
    const loadouts = loadoutsWithSkin(0, 'memento-mori');
    await page.addInitScript((loadouts) => {
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ loadouts }),
      );
      localStorage.setItem(
        'breakpoint.graphics.v2',
        JSON.stringify({ preset: 'performance', adaptive: false }),
      );
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error('Fullscreen denied'));
    }, loadouts);
    const hud = page.getByTestId('weapon-status');
    const draws = () =>
      page
        .getByTestId('render-resolution')
        .getAttribute('data-world-draws')
        .then(Number);
    let menuDraws: number;
    try {
      await page.goto('/');
      await expect.poll(draws).toBeGreaterThan(0);
      menuDraws = await draws();
      await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
      await expect(hud).toHaveAttribute('data-rifle-skin-status', 'loading');
      await expect(hud).toContainText('LOADING MEMENTO MORI');
      await expect.poll(draws).toBe(menuDraws);
    } finally {
      releaseDownload();
    }
    await expect(hud).toHaveAttribute('data-rifle-skin-status', 'ready');
    await expect.poll(draws).toBeGreaterThan(menuDraws);
    await page.getByRole('button', { name: 'Inspect weapon' }).tap();
    await expect(hud).toHaveAttribute('data-inspecting', 'true');
    await page.getByRole('button', { name: 'Aim down sights' }).tap();
    await expect(hud).toHaveAttribute('data-inspecting', 'false');
    await expect(page.locator('.crosshair')).toHaveCSS('visibility', 'hidden');
  });
});

test('a failed Memento Mori download leaves the default rifle playable', async ({
  page,
}) => {
  await trackAudioSamples(page);
  await page.route('**/models/memento.glb', (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    (loadouts) =>
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ loadouts }),
      ),
    loadoutsWithSkin(0, 'memento-mori'),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  const hud = page.getByTestId('weapon-status');
  await expect(hud).toHaveAttribute('data-rifle-skin-status', 'unavailable');
  await expect(hud).toContainText('MEMENTO MORI UNAVAILABLE');
  await expect(page.locator('.crosshair')).toBeVisible();
  const audio = page.locator('html');
  await expect(audio).toHaveAttribute('data-decoded-samples', /\b192\b/);
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '29');
  await expect(audio).toHaveAttribute('data-played-samples', /\b192\b/);
  await expect(audio).not.toHaveAttribute('data-played-samples', /\b339\b/);
});
