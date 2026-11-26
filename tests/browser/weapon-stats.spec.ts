import { expect, test } from '@playwright/test';
import { weaponConfigs, weaponOrder } from '@breakpoint/shared';
import { weaponStatistics } from '@breakpoint/shared/weapons/statistics';

test('Loadouts show configuration-derived statistics and body/range profiles at compact sizes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'LOADOUTS', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Loadouts' });
  const stats = page.getByTestId('weapon-statistics');
  for (const id of weaponOrder) {
    const config = weaponConfigs[id];
    await dialog.getByLabel('Change Weapon').selectOption(id);
    await expect(stats).toHaveAttribute('data-weapon', id);
    await expect(stats.getByRole('meter')).toHaveCount(6);
    for (const stat of weaponStatistics(config)) {
      await expect(stats.locator(`[data-stat="${stat.id}"]`)).toHaveAttribute(
        'data-value',
        String(stat.value),
      );
      await expect(
        stats.getByRole('meter', { name: stat.label, exact: true }),
      ).toHaveAttribute('value', String(stat.rating));
    }
  }
  await expect(stats.getByText('Magazine Capacity')).toBeVisible();
  await dialog
    .getByText('BODY MULTIPLIERS & RANGE PROFILE', { exact: true })
    .click();
  await expect(
    dialog
      .getByRole('table', { name: 'Body damage multipliers' })
      .locator('tbody tr'),
  ).toHaveCount(11);
  await expect(
    dialog
      .getByRole('table', { name: 'Range damage multipliers' })
      .locator('tbody tr'),
  ).toHaveCount(weaponConfigs.sniper.damageFalloff.length);
  await page.screenshot({ path: 'test-results/bp10-armory.png' });
  for (const viewport of [
    { width: 960, height: 640 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await dialog
      .getByText('Maximum bullet travel:', { exact: false })
      .scrollIntoViewIfNeeded();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await dialog
        .getByTestId('weapon-statistics')
        .evaluate((element) => element.scrollTop > 0),
    ).toBe(true);
  }
  await page.screenshot({ path: 'test-results/bp10-armory-390.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'LOADOUTS', exact: true }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test('training switches between saved slots without changing the saved default', async ({
  page,
}) => {
  await page.goto('/');
  const enter = page.getByRole('button', { name: 'ENTER TRAINING' });
  await expect(enter).toBeEnabled();
  await enter.click();
  const hud = page.getByTestId('weapon-status');
  await page.keyboard.press('4');
  await expect(hud).toHaveAttribute('data-weapon', 'sniper');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'LOADOUTS', exact: true }).click();
  await expect(page.getByTestId('weapon-statistics')).toHaveAttribute(
    'data-weapon',
    'rifle',
  );
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'RESUME TRAINING' }).click();
  await page.keyboard.press('2');
  await expect(hud).toHaveAttribute('data-weapon', 'smg');
});

test('the lobby editor saves any category independently of room restrictions', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Armory host');
  await page.getByLabel('Restrict weapons', { exact: true }).check();
  await page.getByLabel('Shotgun', { exact: true }).check();
  await page.getByLabel('Sniper', { exact: true }).check();
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  await page
    .getByRole('button', { name: 'LOADOUTS', exact: true })
    .last()
    .click();
  const selector = page.getByLabel('Change Weapon');
  expect(await selector.locator('option').count()).toBe(4);
  await selector.selectOption('sniper');
  await expect(page.getByTestId('weapon-statistics')).toHaveAttribute(
    'data-weapon',
    'sniper',
  );
  await page.getByRole('button', { name: 'Save Loadout' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
});
