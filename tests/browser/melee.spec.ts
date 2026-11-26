import { test, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { defaultLoadouts } from '@breakpoint/shared/weapons/loadouts';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

test('previews all three blades, saves the selected blade and toggles it in training', async ({
  page,
}) => {
  const models = {
    'glacier-fang': 'glacier_fang_knife.glb',
    'ember-talon': 'ember_talon_karambit.glb',
    'void-ronin': 'void_ronin_katana.glb',
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const open = page.getByRole('button', { name: 'LOADOUTS', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Loadouts' });
  const select = dialog.getByLabel('Melee Weapon');
  const preview = dialog.getByTestId('weapon-showcase');
  for (const [id, filename] of Object.entries(models)) {
    const response = page.waitForResponse((entry) =>
      entry.url().endsWith(`/${filename}`),
    );
    if (id === 'glacier-fang')
      await dialog.getByRole('button', { name: 'Melee', exact: true }).click();
    else await select.selectOption(id);
    expect((await response).ok()).toBe(true);
    await expect(preview).toHaveAttribute('data-status', 'ready');
  }
  await select.selectOption('ember-talon');
  await dialog.getByRole('button', { name: 'Save Loadout' }).click();
  await expect(dialog.getByText('Loadout 1 saved')).toBeVisible();

  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.reload();
  await page.bringToFront();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-15T01:00:00Z'));

  const hud = page.getByTestId('weapon-status');
  const speed = page.getByTestId('speed');
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.clock.runFor(720);
  expect(Number(await speed.textContent())).toBeCloseTo(6.8, 1);
  const ammo = await hud.getAttribute('data-ammo');

  await page.keyboard.press('q');
  await page.clock.runFor(570);
  await expect(hud).toHaveAttribute('data-weapon', 'melee');
  expect(Number(await speed.textContent())).toBeCloseTo(8, 1);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-melee-skin', 'ember-talon');
  await expect(hud).toHaveAttribute('data-melee-skin-status', 'ready');
  await expect(hud.getByText('MELEE READY')).toBeVisible();
  await expect(hud.locator('.ammo-line')).toHaveCount(0);
  await page.mouse.down();
  await page.clock.runFor(90);
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-shots', '1');

  await page.keyboard.press('q');
  await page.clock.runFor(360);
  await expect(hud).toHaveAttribute('data-weapon', 'rifle');
  await expect(hud).toHaveAttribute('data-ammo', ammo!);
  expect(errors).toEqual([]);
});

test('switches to melee in a private match and loads the blade held by a remote character', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Melee host');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const profile = defaultLoadouts();
  profile.slots[0].operator = 'crimson-officer';
  profile.slots[0].meleeSkin = 'void-ronin';
  const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    (await page.getByTestId('room-code').textContent())!,
    { name: 'Melee peer', profile },
  );
  try {
    for (const type of ['shot', 'kill', 'notice', 'correction'])
      guest.onMessage(type, () => {});
    guest.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    const hud = page.getByTestId('weapon-status');
    await page.keyboard.press('q');
    await expect(hud).toHaveAttribute('data-weapon', 'melee');
    await expect(hud).toHaveAttribute('data-melee-skin', 'glacier-fang');
    await expect
      .poll(() => guest.state.players.get(guest.state.hostId)?.weapon)
      .toBe('melee');

    const remoteAsset = page.waitForResponse((entry) =>
      entry.url().endsWith('/void_ronin_katana.glb'),
    );
    guest.send('input', [
      {
        seq: 1,
        life: guest.state.players.get(guest.sessionId)!.life,
        forward: 0,
        right: 0,
        yaw: 0,
        pitch: 0,
        sprint: false,
        jump: false,
        jumpPressed: false,
        slidePressed: false,
        divePressed: false,
        weapon: {
          fire: false,
          firePressed: false,
          aim: false,
          reloadPressed: false,
          switchTo: 'melee',
        },
      },
    ]);
    expect((await remoteAsset).ok()).toBe(true);
    await page.keyboard.press('q');
    await expect(hud).toHaveAttribute('data-weapon', 'rifle');
    await expect(hud).toHaveAttribute('data-rifle-skin', 'memento-mori');
    expect(errors).toEqual([]);
  } finally {
    await guest.leave();
  }
});
