import { enterStartedMatch } from './helpers/matchEntry';
import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

async function prepare(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'off',
      }),
    ),
  );
  await page.clock.install({ time: new Date('2026-11-17T00:00:00Z') });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
}
async function enter(page: Page) {
  await page.bringToFront();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-17T01:00:00Z'));
  await page.clock.runFor(300);
}
async function tap(page: Page) {
  await page.mouse.down();
  await page.clock.runFor(32);
  await page.mouse.up();
}

for (const weapon of [
  { key: '1', name: 'rifle', magazine: 30 },
  { key: '4', name: 'sniper', magazine: 5 },
]) {
  test(`fresh ${weapon.name} ADS cancels a partial reload and held ADS allows reloading`, async ({
    page,
  }) => {
    await prepare(page);
    await enter(page);
    const hud = page.getByTestId('weapon-status');
    await page.keyboard.press(weapon.key);
    await page.clock.runFor(400);
    await tap(page);
    await page.clock.runFor(1500);
    await expect(hud).toHaveAttribute('data-ammo', String(weapon.magazine - 1));
    await page.keyboard.press('r');
    await page.clock.runFor(300);
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.mouse.down({ button: 'right' });
    await page.clock.runFor(800);
    await expect(hud).toHaveAttribute('data-reloading', 'false');
    if (weapon.name === 'sniper')
      await expect(page.getByTestId('sniper-scope')).toHaveCSS('opacity', '1');
    await expect(hud).toHaveAttribute('data-ammo', String(weapon.magazine - 1));
    await expect(hud).toHaveAttribute('data-reserve', 'unlimited');
    await page.clock.runFor(3000);
    await expect(hud).toHaveAttribute('data-ammo', String(weapon.magazine - 1));
    await page.keyboard.press('r');
    await page.clock.runFor(300);
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.mouse.up({ button: 'right' });
    await page.clock.runFor(32);
    await page.mouse.down({ button: 'right' });
    await page.clock.runFor(32);
    await expect(hud).toHaveAttribute('data-reloading', 'false');
    await page.mouse.up({ button: 'right' });
  });
}

test('auto reload starts on empty, partial reloads cancel to fire, and empty reloads keep running', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await enter(page);
  const hud = page.getByTestId('weapon-status');
  await page.keyboard.press('r');
  await page.clock.runFor(100);
  await expect(hud).toHaveAttribute('data-reloading', 'false');
  await page.mouse.down();
  await page.clock.runFor(350);
  await page.mouse.up();
  const remaining = Number(await hud.getAttribute('data-ammo'));
  expect(remaining).toBeLessThan(30);
  await page.keyboard.press('r');
  await page.clock.runFor(450);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await page.screenshot({ path: 'test-results/bp06-partial-reload.png' });
  await tap(page);
  await expect(hud).toHaveAttribute('data-reloading', 'false');
  await expect(hud).toHaveAttribute('data-ammo', String(remaining - 1));
  await expect(hud).toHaveAttribute('data-reserve', 'unlimited');
  await page.clock.runFor(3000);
  await expect(hud).toHaveAttribute('data-ammo', String(remaining - 1));
  await expect(hud).toHaveAttribute('data-reserve', 'unlimited');
  await page.screenshot({ path: 'test-results/bp06-interrupted.png' });
  await page.mouse.down();
  await page.clock.runFor((remaining - 1) * 100 + 100);
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '0');
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await page.clock.runFor(450);
  await tap(page);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await expect(hud).toHaveAttribute('data-ammo', '0');
  await page.clock.runFor(2300);
  await expect(hud).toHaveAttribute('data-ammo', '30');
  await expect(hud).toHaveAttribute('data-reserve', 'unlimited');
  await expect(hud).toHaveAttribute('data-reloading', 'false');
  await page.keyboard.press('r');
  await page.clock.runFor(200);
  await expect(hud).toHaveAttribute('data-reloading', 'false');
  expect(errors).toEqual([]);
});

test('auto reload defaults on, persists off, resets on, and manual R still works when disabled', async ({
  page,
}) => {
  await prepare(page);
  const settings = async () =>
    page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await settings();
  await expect(page.getByLabel('Auto Reload', { exact: true })).toBeChecked();
  await page.getByLabel('Auto Reload', { exact: true }).uncheck();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await settings();
  await expect(
    page.getByLabel('Auto Reload', { exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'RESTORE DEFAULTS' }).click();
  await expect(page.getByLabel('Auto Reload', { exact: true })).toBeChecked();
  await page.getByLabel('Auto Reload', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await enter(page);
  const hud = page.getByTestId('weapon-status');
  await page.mouse.down();
  await page.clock.runFor(3500);
  await page.mouse.up();
  await page.clock.runFor(2300);
  await expect(hud).toHaveAttribute('data-ammo', '0');
  await expect(hud).toHaveAttribute('data-reserve', 'unlimited');
  await expect(hud).toHaveAttribute('data-reloading', 'false');
  await page.keyboard.press('r');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await tap(page);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await page.clock.runFor(2100);
  await expect(hud).toHaveAttribute('data-ammo', '30');
  await expect(hud).toHaveAttribute('data-reserve', 'unlimited');
});

test('server honors the auto reload setting and authoritatively cancels or completes reloads', async ({
  page,
}) => {
  test.setTimeout(120000);
  let peer: Room<unknown, RoomState> | undefined;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'off',
      }),
    );
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({ autoReload: false }),
    );
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Reloader');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    peer = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
      code!,
      { name: 'Observer' },
    );
    for (const message of ['shot', 'kill', 'correction', 'notice'])
      peer.onMessage(message, () => {});
    peer.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await expect(page.locator('.crosshair')).toBeVisible();
    const hud = page.getByTestId('weapon-status');
    await expect(hud).toHaveAttribute('data-ammo', '30');
    await page.mouse.down();
    await expect(hud).toHaveAttribute('data-ammo', '0', { timeout: 15000 });
    await page.mouse.up();
    await page.waitForTimeout(2300);
    await expect(hud).toHaveAttribute('data-reloading', 'false');
    await expect(hud).toHaveAttribute('data-reserve', '120');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
    await page.getByLabel('Auto Reload', { exact: true }).check();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.getByRole('button', { name: 'ENTER ROOM' }).click();
    await expect(page.locator('.crosshair')).toBeVisible();
    await expect(hud).toHaveAttribute('data-ammo', '30');
    await expect(hud).toHaveAttribute('data-reserve', '90');
    await page.mouse.click(640, 360);
    await expect(hud).toHaveAttribute('data-ammo', '29');
    await page.keyboard.press('r');
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.mouse.click(640, 360);
    await expect(hud).toHaveAttribute('data-reloading', 'false');
    await expect(hud).toHaveAttribute('data-ammo', '28');
    await page.waitForTimeout(2300);
    await expect(hud).toHaveAttribute('data-ammo', '28');
    await expect(hud).toHaveAttribute('data-reserve', '90');
    await page.keyboard.press('r');
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.mouse.down({ button: 'right' });
    await expect(hud).toHaveAttribute('data-reloading', 'false');
    await expect(hud).toHaveAttribute('data-ammo', '28');
    await expect(hud).toHaveAttribute('data-reserve', '90');
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.mouse.up({ button: 'right' });
    await page.mouse.down({ button: 'right' });
    await expect(hud).toHaveAttribute('data-reloading', 'false');
    await page.mouse.up({ button: 'right' });
    await page.mouse.down();
    await expect(hud).toHaveAttribute('data-ammo', '0', { timeout: 15000 });
    await page.mouse.up();
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.mouse.click(640, 360);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.mouse.up({ button: 'right' });
    await expect(hud).toHaveAttribute('data-ammo', '30');
    await expect(hud).toHaveAttribute('data-reserve', '60');
    await expect(hud).toHaveAttribute('data-reloading', 'false');
    await page.screenshot({ path: 'test-results/bp06-server-reload.png' });
    expect(errors).toEqual([]);
  } finally {
    await peer?.leave();
  }
});
