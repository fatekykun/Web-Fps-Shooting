import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import type { KillEvent, ServerShot } from '@breakpoint/shared/combat';
import { avatarParts, standingAnchor } from '@breakpoint/shared/avatar';
import { movementConfig } from '@breakpoint/shared';

async function enter(page: Page) {
  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'ENTER TRAINING' });
  await expect(button).toBeEnabled();
  await page.bringToFront();
  await button.click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-15T01:00:00Z'));
  await page.clock.runFor(300);
  await page.keyboard.press('4');
  await page.clock.runFor(300);
}

test('sniper scope, bolt lockout, five-round reload and movement remain responsive', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  const hud = page.getByTestId('weapon-status');
  const number = async (name: string) =>
    Number(await hud.getAttribute(`data-${name}`));
  await expect(hud).toHaveAttribute('data-weapon', 'sniper');
  await expect(hud).toHaveAttribute('data-ammo', '5');
  await page.screenshot({ path: 'test-results/bp04-sniper-model.png' });
  const hipSpread = await number('spread');
  const baseFov = await number('fov');
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(1100);
  expect(await number('ads')).toBeGreaterThan(0.99);
  expect(
    Math.tan((baseFov * Math.PI) / 360) /
      Math.tan(((await number('fov')) * Math.PI) / 360),
  ).toBeCloseTo(4, 1);
  expect(await number('spread')).toBeLessThan(hipSpread / 100);
  await expect(page.getByTestId('sniper-scope')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/bp04-sniper-scope.png' });
  await page.mouse.down();
  await page.clock.runFor(96);
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-ammo', '4');
  await expect(hud).toHaveAttribute('data-cycling', 'true');
  await expect(hud).toHaveAttribute('data-hits', '1');
  expect(await number('recoil')).toBeGreaterThan(0);
  await page.mouse.down();
  await page.clock.runFor(300);
  await page.mouse.up();
  await expect(hud).toHaveAttribute('data-shots', '1');
  await page.mouse.up({ button: 'right' });
  await page.clock.runFor(1200);
  expect(await number('fov')).toBeGreaterThan(baseFov - 0.1);
  for (let i = 0; i < 4; i++) {
    await page.mouse.down();
    await page.clock.runFor(1400);
    await page.mouse.up();
  }
  await expect(hud).toHaveAttribute('data-ammo', '0');
  await expect(hud).toHaveAttribute('data-shots', '5');
  await page.keyboard.press('r');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await page.clock.runFor(2700);
  await expect(hud).toHaveAttribute('data-ammo', '5');
  await expect(hud).toHaveAttribute('data-reserve', '15');
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('w');
  await page.clock.runFor(800);
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    2,
  );
  expect(Number(await page.getByTestId('speed').textContent())).toBeLessThan(
    2.6,
  );
  await page.keyboard.press('Space');
  await page.clock.runFor(256);
  expect(await number('spread')).toBeGreaterThan(0.01);
  await page.keyboard.down('Shift');
  await page.clock.runFor(800);
  expect(await number('ads')).toBeLessThan(0.02);
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    7,
  );
  await page.keyboard.press('c');
  await page.clock.runFor(32);
  await page.keyboard.up('Shift');
  await page.clock.runFor(224);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sliding',
  );
  expect(await number('ads')).toBeLessThan(0.02);
  await page.keyboard.press('Space');
  await page.clock.runFor(256);
  await expect(page.getByTestId('movement-state')).toHaveText('AIRBORNE');
  await page.keyboard.up('w');
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('1');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-weapon', 'rifle');
  await expect(page.getByTestId('sniper-scope')).toHaveCSS('opacity', '0');
  expect(errors).toEqual([]);
});

test('sniper damage, kills, ammo and shot effects are server-confirmed in an eight-player room', async ({
  page,
}) => {
  const peers: Room<unknown, RoomState>[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Sniper');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    const client = new Client('http://127.0.0.1:2567');
    const shots: ServerShot[] = [],
      kills: KillEvent[] = [];
    for (let i = 0; i < 7; i++) {
      const peer = await client.joinById<RoomState>(code!, {
        name: `Target${i}`,
      });
      peers.push(peer);
      peer.onMessage('shot', (shot: ServerShot) => {
        if (i === 0) shots.push(shot);
      });
      peer.onMessage('kill', (kill: KillEvent) => {
        if (i === 0) kills.push(kill);
      });
      peer.onMessage('correction', () => {});
      peer.onMessage('notice', () => {});
      peer.send('ready', true);
    }
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await page.getByRole('button', { name: 'BACK TO ARENA' }).click();
    await page.getByRole('button', { name: 'ENTER ROOM' }).click();
    await page.keyboard.press('4');
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'sniper',
    );
    const state = peers[0]!.state;
    const shooter = [...state.players.values()].find(
      (p) => p.name === 'Sniper',
    )!;
    const victim = state.players.get(peers[0]!.sessionId)!;
    const dx = victim.x - shooter.x,
      dz = victim.z - shooter.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(
      victim.y -
        standingAnchor +
        avatarParts[0][1] -
        (shooter.y + movementConfig.eyeOffset),
      Math.hypot(dx, dz),
    );
    await page.evaluate(
      ({ yaw, pitch }) =>
        document.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: -yaw / 0.002,
            movementY: -pitch / 0.002,
          }),
        ),
      { yaw, pitch },
    );
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(1200);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect.poll(() => kills.length).toBe(1);
    expect(kills[0]).toMatchObject({
      weapon: 'sniper',
      killer: 'Sniper',
      victim: 'Target0',
      headshot: true,
    });
    expect(shots[0]).toMatchObject({ weapon: 'sniper', shooter: shooter.id });
    expect(shots[0]!.traces).toHaveLength(1);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-ammo',
      '4',
    );
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-hits',
      '1',
    );
    await expect(page.getByRole('list', { name: 'Kill feed' })).toContainText(
      'Target0',
    );
    await page.screenshot({ path: 'test-results/bp04-server-sniper.png' });
    expect(errors).toEqual([]);
  } finally {
    for (const peer of peers) await peer.leave();
  }
});
