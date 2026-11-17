import { expect, test } from '@playwright/test';

test('a pending room request can be cancelled without a late error interrupting training', async ({
  page,
}) => {
  let release!: () => void;
  let intercepted = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/matchmake/create/**', async (route) => {
    intercepted = true;
    await pending;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Delayed unavailable server' }),
    });
  });
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Create a room', exact: true })
      .click();
    await page.getByLabel('PLAYER NAME').fill('CancelCheck');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.getByRole('status')).toContainText('ESTABLISHING COMMS');
    await page.getByRole('button', { name: 'Close rooms' }).click();
    release();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
    await expect(page.locator('.crosshair')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    release();
  }
});

test('command navigation, accessible dialogs and a compact viewport', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await menu.getByRole('button', { name: 'PLAY', exact: true }).click();
  const play = page.getByRole('dialog', { name: 'Play', exact: true });
  await expect(
    play.getByRole('button', { name: /TRAINING GROUND/ }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(play).toHaveCount(0);
  await expect(
    menu.getByRole('button', { name: 'PLAY', exact: true }),
  ).toBeFocused();
  await menu.getByRole('button', { name: 'CREDITS', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Credits' })
      .getByRole('link', { name: 'Colyseus' }),
  ).toHaveAttribute('href', 'https://colyseus.io/');
  await page.screenshot({
    path: 'test-results/retro-credits.png',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Close credits' }).click();
  await menu.getByRole('button', { name: 'Join a room', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'JOIN ROOM' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('ROOM CODE', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'JOIN ROOM', exact: true }),
  ).toBeDisabled();
  await page.getByRole('tab', { name: 'CREATE ROOM' }).click();
  await expect(page.getByLabel('GAME MODE')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 960, height: 640 });
  await page.screenshot({ path: 'test-results/retro-menu-960.png' });
  const controls = await menu.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        top: rect.top,
      };
    }),
  );
  expect(
    controls.every(
      (rect) =>
        rect.left >= 0 &&
        rect.right <= 960 &&
        rect.top >= 78 &&
        rect.bottom < 560,
    ),
  ).toBe(true);
  await menu.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.screenshot({
    path: 'test-results/retro-settings-960.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 640, height: 640 });
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const bounds = await settings.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.screenshot({ path: 'test-results/retro-menu-640.png' });
  await menu.getByRole('button', { name: 'PLAY', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Play', exact: true })
    .getByRole('button', { name: /TRAINING GROUND/ })
    .click();
  await expect(page.locator('.crosshair')).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe(
    'CANVAS',
  );
  expect(errors).toEqual([]);
});

test('settings persist and drive actual bindings, FOV, reticle, display and audio', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const native = window.AudioContext;
    const counters = { contexts: 0 };
    Object.assign(window, { audioTest: counters });
    window.AudioContext = new Proxy(native, {
      construct(target, args) {
        counters.contexts++;
        return Reflect.construct(target, args);
      },
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  const contextCount = () =>
    page.evaluate(
      () =>
        (window as unknown as { audioTest: { contexts: number } }).audioTest
          .contexts,
    );
  expect(await contextCount()).toBe(0);
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await page.getByRole('slider', { name: /Field of view/ }).focus();
  await page.keyboard.press('End');
  await page.getByRole('tab', { name: /SENSITIVITY/ }).click();
  await page
    .getByRole('slider', { name: /Camera Steering Sensitivity/ })
    .focus();
  await page.keyboard.press('Home');
  await page.getByRole('tab', { name: /CONTROLS/ }).click();
  await page
    .getByRole('button', { name: 'Rebind Move forward', exact: true })
    .click();
  await page.keyboard.press('e');
  await expect(
    page.getByRole('button', { name: 'Rebind Move forward', exact: true }),
  ).toHaveText('E');
  await page
    .getByRole('button', { name: 'Rebind Reload', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Rebind Reload', exact: true }),
  ).toHaveText('R');
  await page.screenshot({ path: 'test-results/retro-settings-controls.png' });
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  await page.getByLabel('Resolution preset').selectOption('performance');
  await page.getByLabel('Adaptive resolution', { exact: true }).uncheck();
  await page.getByLabel('Reduced motion', { exact: true }).check();
  await page.screenshot({ path: 'test-results/retro-settings-display.png' });
  await page.getByRole('tab', { name: /AUDIO/ }).click();
  await page.getByRole('button', { name: 'PLAY TEST TONE' }).click();
  await expect(page.getByText(/AUDIO READY/)).toBeVisible();
  expect(await contextCount()).toBe(1);
  await page.getByLabel('Mute all audio').check();
  await expect(
    page.getByRole('button', { name: 'PLAY TEST TONE' }),
  ).toBeDisabled();
  await page.getByRole('tab', { name: /CROSSHAIR/ }).click();
  await page.getByLabel('Center dot', { exact: true }).uncheck();
  await page.getByLabel('Dynamic spread indicator', { exact: true }).uncheck();
  await page.getByRole('slider', { name: /Crosshair length/ }).focus();
  await page.keyboard.press('End');
  await page.getByLabel('Crosshair color', { exact: true }).fill('#88cbdc');
  await expect(settings.locator('.crosshair')).toHaveClass(/no-dot/);
  await page.screenshot({ path: 'test-results/retro-settings-crosshair.png' });
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Unmute audio' }),
  ).toBeVisible();
  await expect(page.getByTestId('render-resolution')).toHaveAttribute(
    'data-preset',
    'performance',
  );
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  const reticle = page.locator('.crosshair');
  await expect(reticle).toBeVisible();
  await expect(reticle).toHaveClass(/no-dot/);
  await expect(reticle).toHaveCSS('--reticle-length', '14px');
  await expect(reticle).toHaveCSS('--reticle-gap', '5px');
  await expect(reticle.locator('i').first()).toHaveCSS(
    'background-color',
    'rgb(136, 203, 220)',
  );
  const hud = page.getByTestId('weapon-status');
  await expect(hud).toHaveAttribute('data-fov', '110');
  const position = page.getByTestId('position');
  const z = Number(await position.getAttribute('data-z'));
  await page.keyboard.down('e');
  await expect
    .poll(async () => Number(await position.getAttribute('data-z')))
    .toBeLessThan(z - 1);
  await page.keyboard.up('e');
  await page.mouse.down({ button: 'right' });
  await expect
    .poll(async () => Number(await hud.getAttribute('data-fov')))
    .toBeLessThan(65);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(page.getByRole('slider', { name: /Field of view/ })).toHaveValue(
    '110',
  );
  await page.getByRole('tab', { name: /SENSITIVITY/ }).click();
  await expect(
    page.getByRole('slider', { name: /Camera Steering Sensitivity/ }),
  ).toHaveValue('1');
  await page.getByRole('button', { name: 'RESTORE DEFAULTS' }).click();
  await expect(
    page.getByRole('slider', { name: /Camera Steering Sensitivity/ }),
  ).toHaveValue('100');
  await page.getByRole('tab', { name: /CONTROLS/ }).click();
  await expect(page.getByRole('slider', { name: /Field of view/ })).toHaveValue(
    '85',
  );
  await expect(
    page.getByRole('button', { name: 'Rebind Move forward', exact: true }),
  ).toHaveText('W');
  expect(errors).toEqual([]);
});
