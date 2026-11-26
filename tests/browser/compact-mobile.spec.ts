import { expect, test } from '@playwright/test';

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 760, height: 304 },
  screen: { width: 393, height: 873 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; RMX3663) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
});

test('short landscape keeps main navigation and primary settings in view', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-device', 'phone');
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  const training = page.getByRole('button', { name: 'ENTER TRAINING' });
  await expect(training).toBeEnabled();
  for (const viewport of [
    { width: 760, height: 304 },
    { width: 640, height: 280 },
  ]) {
    await page.setViewportSize(viewport);
    const header = (await page.locator('.top-bar').boundingBox())!;
    for (const button of await menu.getByRole('button').all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
      const bounds = (await button.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(header.y + header.height);
    }
    await expect(training).toBeInViewport({ ratio: 1 });
  }

  await page.setViewportSize({ width: 700, height: 304 });
  await menu.getByRole('button', { name: 'SETTINGS' }).tap();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(
    settings.getByRole('button', { name: /CUSTOMIZE TOUCH HUD/ }),
  ).toBeInViewport({ ratio: 1 });
  await expect(settings.getByLabel('Field of view')).toBeInViewport({
    ratio: 1,
  });
  await expect(settings.getByLabel('Sync ADS FOV')).toBeInViewport({
    ratio: 1,
  });
  await expect(settings.getByLabel('Auto Reload')).toBeInViewport({
    ratio: 1,
  });
  await settings.getByRole('tab', { name: 'SENSITIVITY' }).tap();
  await expect(settings.getByLabel('Touch general camera')).toBeInViewport({
    ratio: 1,
  });
  await expect(settings.getByLabel('Touch sniper')).toBeInViewport({
    ratio: 1,
  });
  await settings.getByRole('tab', { name: 'DISPLAY' }).tap();
  await expect(settings.getByLabel('Resolution preset')).toBeInViewport({
    ratio: 1,
  });
  await expect(settings.getByLabel('Shadow quality')).toBeInViewport({
    ratio: 1,
  });
  await settings
    .getByLabel('Detailed performance diagnostics')
    .scrollIntoViewIfNeeded();
  await settings.getByRole('tab', { name: 'AUDIO' }).tap();
  await expect(settings.getByLabel('Master volume')).toBeInViewport({
    ratio: 1,
  });
  await expect(settings.getByLabel('Ambient volume')).toBeInViewport({
    ratio: 1,
  });
  await expect(
    settings.getByRole('button', { name: 'RESTORE DEFAULTS' }),
  ).toBeInViewport({ ratio: 1 });
});

test('short landscape fits both join fields and the submit button', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Join a room' }).tap();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('PLAYER NAME');
  const code = dialog.getByLabel('ROOM CODE');
  const join = dialog.getByRole('button', { name: 'JOIN ROOM' });
  for (const control of [name, code, join]) {
    await expect(control).toBeInViewport({ ratio: 1 });
  }
  await expect(name).not.toBeFocused();
  await name.fill('Mobile recruit');
  await code.fill('ABC234');
  await expect(join).toBeEnabled();

  await dialog.getByRole('tab', { name: 'CREATE ROOM' }).tap();
  await expect(dialog.getByLabel('GAME MODE')).toBeInViewport({ ratio: 1 });
  await expect(
    dialog.getByRole('combobox', { name: 'MAP', exact: true }),
  ).toBeInViewport({ ratio: 1 });
  const create = dialog.getByRole('button', { name: 'CREATE PRIVATE ROOM' });
  await create.scrollIntoViewIfNeeded();
  await expect(create).toBeInViewport({ ratio: 1 });
  await expect(
    dialog.getByRole('button', { name: 'Close rooms' }),
  ).toBeInViewport({ ratio: 1 });
});

test('short landscape fits the loadout preview and keeps save accessible while scrolling stats', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'LOADOUTS' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Loadouts' });
  const inspect = dialog.getByRole('button', { name: 'Full Screen Inspect' });
  const save = dialog.getByRole('button', { name: 'Save Loadout' });
  for (const control of [
    dialog.getByLabel('Character', { exact: true }),
    dialog.getByLabel('Change Weapon'),
    dialog.getByLabel('Change Skin'),
    dialog.getByLabel('Melee Weapon'),
    dialog.getByTestId('weapon-showcase'),
    inspect,
    save,
  ]) {
    await expect(control).toBeInViewport({ ratio: 1 });
  }
  await save.tap();
  await expect(dialog.getByText('Loadout 1 saved')).toBeInViewport({
    ratio: 1,
  });
  await inspect.tap();
  const preview = dialog.getByTestId('weapon-showcase');
  expect((await preview.boundingBox())!.width).toBeGreaterThan(700);
  await dialog.getByRole('button', { name: 'Exit Full Screen' }).tap();

  const details = dialog.getByText('BODY MULTIPLIERS & RANGE PROFILE');
  await details.scrollIntoViewIfNeeded();
  await expect(details).toBeInViewport({ ratio: 1 });
  await expect(save).toBeInViewport({ ratio: 1 });
  await save.tap();
  await expect(dialog.getByText('Loadout 1 saved')).toBeVisible();
});
