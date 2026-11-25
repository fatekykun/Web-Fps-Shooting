import { expect, test, type Locator, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text());
  });
  return errors;
}

async function expectLotusReticle(scope: Locator) {
  const lens = scope.locator('.scope-lens');
  await expect(lens).toHaveCSS('background-image', /lotus-lava-reticle.*\.png/);
  await expect(lens.locator('i')).toBeHidden();
}

test('Lotus Lava saves from the Armory and renders the imported model, inspect and sniper scope', async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/models/lotus_inferno_v2.glb'))
      requests.push(request.url());
  });
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
  const armory = page.getByRole('button', { name: 'ARMORY', exact: true });
  const sniper = page.getByRole('button', {
    name: 'SR-04 / SNIPER',
    exact: true,
  });
  const skin = page.getByLabel('Sniper skin');
  const hud = page.getByTestId('weapon-status');
  const scope = page.getByTestId('sniper-scope');
  const draws = () =>
    page
      .getByTestId('render-resolution')
      .getAttribute('data-world-draws')
      .then(Number);
  await page.goto('/');
  await enter.click();
  await page.keyboard.press('4');
  await expect(hud).toHaveAttribute('data-sniper-skin', 'standard');
  await expect.poll(draws).toBeGreaterThan(0);
  const baseline = await draws();
  expect(requests).toHaveLength(0);

  await page.keyboard.press('Escape');
  await armory.click();
  await sniper.click();
  await skin.selectOption({ label: 'Lotus Lava' });
  await page.getByRole('button', { name: 'Close armory' }).click();
  await enter.click();
  await expect(hud).toHaveAttribute('data-sniper-skin-status', 'ready');
  await expect(hud).toContainText('SR-04 / LOTUS LAVA');
  await expect(hud).toContainText('HIP FIRE');
  await expect.poll(draws).toBe(baseline + 2);
  expect(requests).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('lotus-lava-hip.png') });

  await page.keyboard.press('i');
  await expect(hud).toHaveAttribute('data-inspecting', 'true');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: testInfo.outputPath('lotus-lava-inspect.png'),
  });
  await page.mouse.down({ button: 'right' });
  await expect(hud).toHaveAttribute('data-inspecting', 'false');
  await expect(scope).toHaveCSS('opacity', '1');
  await expect(scope).toHaveAttribute('data-skin', 'lotus-lava');
  await expectLotusReticle(scope);
  await expect
    .poll(() => hud.getAttribute('data-ads').then(Number))
    .toBeGreaterThan(0.999);
  expect(await hud.getAttribute('data-fov').then(Number)).toBeLessThan(30);
  await page.screenshot({ path: testInfo.outputPath('lotus-lava-ads.png') });
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '4');
  await expect(hud).toHaveAttribute('data-hits', '1');
  await expect(hud).toHaveAttribute('data-cycling', 'true');
  await page.mouse.up({ button: 'right' });
  await expect(hud).toHaveAttribute('data-cycling', 'false');
  await page.keyboard.press('r');
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await expect(hud).toHaveAttribute('data-ammo', '5');
  await page.keyboard.press('1');
  await expect(hud).toHaveAttribute('data-weapon', 'rifle');
  await expect(hud).toHaveAttribute('data-rifle-skin', 'standard');
  await page.keyboard.press('4');
  await expect(hud).toHaveAttribute('data-sniper-skin-status', 'ready');
  expect(requests).toHaveLength(1);

  await page.reload();
  await armory.click();
  await sniper.click();
  await expect(skin).toHaveValue('lotus-lava');
  expect(errors).toEqual([]);
});

test('a failed Lotus Lava download falls back to a working standard sniper', async ({
  page,
}) => {
  await page.route('**/models/lotus_inferno_v2.glb', (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({ sniperSkin: 'lotus-lava' }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await page.keyboard.press('4');
  const hud = page.getByTestId('weapon-status');
  await expect(hud).toHaveAttribute('data-sniper-skin-status', 'unavailable');
  await expect(hud).toContainText('LOTUS LAVA UNAVAILABLE');
  await expect(hud).toContainText('SR-04 / SNIPER');
  await page.mouse.down({ button: 'right' });
  const scope = page.getByTestId('sniper-scope');
  await expect(scope).toHaveCSS('opacity', '1');
  await expect(scope.locator('.scope-lens')).not.toHaveCSS(
    'background-image',
    /lotus-lava-reticle/,
  );
  await expect(scope.locator('.scope-lens i')).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '4');
  await page.mouse.up({ button: 'right' });
});

test.describe('Lotus Lava touch controls', () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 844, height: 390 },
    screen: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
  });
  test('the imported sniper supports inspect and the magnified optic with touch input', async ({
    page,
  }, testInfo) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ sniperSkin: 'lotus-lava', scopeStyle: 'optic' }),
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
    const hud = page.getByTestId('weapon-status');
    const scope = page.getByTestId('sniper-scope');
    for (const weapon of ['smg', 'shotgun', 'sniper']) {
      await page.getByRole('button', { name: 'Switch weapon' }).tap();
      await expect(hud).toHaveAttribute('data-weapon', weapon);
      await expect(hud).toContainText('HIP FIRE');
    }
    await expect(hud).toHaveAttribute('data-sniper-skin-status', 'ready');
    await page.getByRole('button', { name: 'Inspect weapon' }).tap();
    await expect(hud).toHaveAttribute('data-inspecting', 'true');
    await page.getByRole('button', { name: 'Toggle ADS' }).tap();
    await expect(scope).toHaveAttribute('data-style', 'optic');
    await expect(scope).toHaveCSS('opacity', '1');
    await expectLotusReticle(scope);
    await expect(hud).toHaveAttribute('data-inspecting', 'false');
    await page.screenshot({
      path: testInfo.outputPath('lotus-lava-mobile-optic.png'),
    });
    expect(errors).toEqual([]);
  });
});
