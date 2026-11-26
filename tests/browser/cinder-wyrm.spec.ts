import { defaultLoadouts } from '@breakpoint/shared/weapons/loadouts';
import { expect, test } from '@playwright/test';

test('Molten Lava saves from Loadouts, renders its ADS sight and yields inspect to firing', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) {
        const data = document.documentElement.dataset;
        data.playedSamples = `${data.playedSamples ?? ''},${Math.round(this.buffer.duration * 1000)}`;
      }
      start.apply(this, args);
    };
  });
  const playedSamples = () =>
    page.evaluate(() =>
      (document.documentElement.dataset.playedSamples ?? '')
        .split(',')
        .map(Number),
    );
  await page.addInitScript(() =>
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'off',
        textureQuality: 'low',
      }),
    ),
  );
  const enter = page.getByRole('button', { name: /^(ENTER|RESUME) TRAINING$/ });
  const armory = page.getByRole('button', { name: 'LOADOUTS', exact: true });
  const hud = page.getByTestId('weapon-status');
  const draws = () =>
    page
      .getByTestId('render-resolution')
      .getAttribute('data-world-draws')
      .then(Number);
  const initial = defaultLoadouts();
  initial.slots[0].skin = 'standard';
  await page.addInitScript((profile) => {
    if (!localStorage.getItem('breakpoint.settings.v1'))
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ loadouts: profile }),
      );
  }, initial);
  await page.goto('/');
  await enter.click();
  await expect(hud).toHaveAttribute('data-rifle-skin', 'standard');
  await expect.poll(draws).toBeGreaterThan(0);
  const standardDraws = await draws();
  await page.keyboard.press('Escape');
  await armory.click();
  await page.getByLabel('Change Skin').selectOption({ label: 'Molten Lava' });
  await page.getByRole('button', { name: 'Save Loadout' }).click();
  await page.reload();
  await armory.click();
  await expect(page.getByLabel('Change Skin')).toHaveValue('cinder-wyrm');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await enter.click();
  await expect(hud).toHaveAttribute('data-rifle-skin', 'cinder-wyrm');
  await expect(hud).toContainText('AR-01 / MOLTEN LAVA');
  await expect.poll(draws).toBeGreaterThan(standardDraws);
  expect(await draws()).toBeLessThanOrEqual(standardDraws + 7);
  await page.screenshot({ path: testInfo.outputPath('hip-fire.png') });

  await page.keyboard.press('i');
  await expect(hud).toHaveAttribute('data-inspecting', 'true');
  await page.waitForTimeout(480);
  await page.screenshot({ path: testInfo.outputPath('inspect.png') });
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveAttribute('data-inspecting', 'false');
  await expect(page.locator('.crosshair')).toHaveCSS('visibility', 'hidden');
  await expect
    .poll(async () => Number(await hud.getAttribute('data-ads')))
    .toBeGreaterThan(0.999);
  const canvas = await page.locator('canvas').screenshot();
  const centerHasDot = await page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const context = new OffscreenCanvas(5, 5).getContext('2d')!;
    context.drawImage(
      image,
      2 - Math.floor(image.width / 2),
      2 - Math.floor(image.height / 2),
    );
    const pixels = context.getImageData(0, 0, 5, 5).data;
    return Array.from({ length: 25 }, (_, i) => i * 4).some(
      (i) => pixels[i]! > 215 && pixels[i + 1]! > 130 && pixels[i + 2]! < 200,
    );
  }, canvas.toString('base64'));
  expect(centerHasDot).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ads.png') });
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '29');
  await expect(hud).toHaveAttribute('data-hits', '1');
  await expect.poll(playedSamples).toContain(680);
  expect(await playedSamples()).not.toContain(192);
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => Number(await hud.getAttribute('data-ads')))
    .toBeLessThan(0.01);
  await page.keyboard.press('r');
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await page.waitForTimeout(650);
  await page.screenshot({ path: testInfo.outputPath('reload.png') });
  await expect(hud).toHaveAttribute('data-ammo', '30');
  await page.keyboard.press('i');
  await expect(hud).toHaveAttribute('data-inspecting', 'true');
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '29');
  await expect(hud).toHaveAttribute('data-inspecting', 'false');

  await page.keyboard.press('2');
  await expect(hud).toHaveAttribute('data-weapon', 'smg');
  await expect(hud).not.toHaveAttribute('data-rifle-skin', 'cinder-wyrm');
  await page.keyboard.press('1');
  await expect(hud).toHaveAttribute('data-rifle-skin', 'cinder-wyrm');
  await page.keyboard.press('Escape');
  await armory.click();
  await page.getByLabel('Change Skin').selectOption('standard');
  await page.getByRole('button', { name: 'Save Loadout' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await enter.click();
  await expect(hud).toHaveAttribute('data-rifle-skin', 'standard');
  await expect(page.locator('.crosshair')).toBeVisible();
  await expect(hud).not.toContainText('EQUIPPING');
  const moltenShots = (await playedSamples()).filter(
    (duration) => duration === 680,
  ).length;
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '28');
  await expect.poll(playedSamples).toContain(192);
  expect(
    (await playedSamples()).filter((duration) => duration === 680),
  ).toHaveLength(moltenShots);
  expect(errors).toEqual([]);
});

test.describe('touch inspect', () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 844, height: 390 },
    screen: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
  });
  test('shows the inspect action for Molten Lava and interrupts it with touch ADS', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({
          loadouts: {
            defaultSlot: 0,
            slots: [
              { weapon: 'rifle', skin: 'cinder-wyrm' },
              { weapon: 'smg', skin: 'neon-blade' },
              { weapon: 'shotgun', skin: 'glorious-blaze' },
              { weapon: 'sniper', skin: 'lotus-lava' },
            ],
          },
        }),
      );
      localStorage.setItem(
        'breakpoint.graphics.v2',
        JSON.stringify({ preset: 'performance', adaptive: false }),
      );
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new Error('Fullscreen denied'));
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    const inspect = page.getByRole('button', { name: 'Inspect weapon' });
    const hud = page.getByTestId('weapon-status');
    await inspect.tap();
    await expect(hud).toHaveAttribute('data-inspecting', 'true');
    await page.getByRole('button', { name: 'Toggle ADS' }).tap();
    await expect(hud).toHaveAttribute('data-inspecting', 'false');
    await expect(page.locator('.crosshair')).toHaveCSS('visibility', 'hidden');
    await page.getByRole('button', { name: 'Switch weapon' }).tap();
    await expect(inspect).toHaveCount(0);
  });
});
