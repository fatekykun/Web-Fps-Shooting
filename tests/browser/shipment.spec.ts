import { expect, test } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { ServerShot } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

test('hosts Shipment with opposite team spawns, matched cover, and playable controls', async ({
  page,
}) => {
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
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('North');
  await page.getByLabel('GAME MODE').selectOption('tdm');
  await page.getByLabel('MAP').selectOption('shipment');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'SHIPMENT / PRIVATE SESSION',
  );
  const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    (await page.getByTestId('room-code').textContent())!,
    { name: 'South', settings: { mapId: 'depot' } },
  );
  const shots: ServerShot[] = [];
  guest.onMessage('shot', (shot: ServerShot) => shots.push(shot));
  for (const type of ['notice', 'kill', 'correction'])
    guest.onMessage(type, () => {});
  try {
    await expect.poll(() => guest.state.mapId).toBe('shipment');
    guest.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await expect(
      page.getByRole('complementary', { name: 'Map and match' }),
    ).toContainText('SHIPMENT');
    await expect(
      page.locator('canvas[aria-label="Shipment container yard"]'),
    ).toBeVisible();
    const north = () => guest.state.players.get(guest.state.hostId)!;
    const south = () => guest.state.players.get(guest.sessionId)!;
    expect(north().z).toBeCloseTo(-15.7);
    expect(north().yaw).toBeCloseTo(Math.PI);
    expect(south().z).toBeCloseTo(15.7);
    expect(south().yaw).toBeCloseTo(0);
    await expect(page.getByTestId('match-start-signal')).toBeHidden();
    await page.screenshot({ path: 'test-results/bp24-shipment-spawn.png' });
    await page.keyboard.down('a');
    await expect.poll(() => north().x).toBeGreaterThan(-6.99);
    await page.keyboard.up('a');
    await page.keyboard.down('w');
    await expect.poll(() => north().z).toBeGreaterThan(-11.65);
    await page.waitForTimeout(280);
    await page.keyboard.up('w');
    expect(north().z).toBeLessThan(-11.4);
    const predictedZ = Number(
      await page.getByTestId('position').getAttribute('data-z'),
    );
    expect(predictedZ).toBeCloseTo(north().z, 0);
    await page.mouse.down();
    await expect.poll(() => shots.length).toBeGreaterThan(0);
    await page.mouse.up();
    expect(shots[0]!.traces[0]!.end.z).toBeCloseTo(-11.1, 2);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-ammo',
      /^(2[0-9]|[0-9])$/,
    );
    const walkUntil = async (key: string, reached: () => boolean) => {
      await page.keyboard.down(key);
      try {
        await expect
          .poll(reached, { timeout: 5000, intervals: [40] })
          .toBe(true);
      } finally {
        await page.keyboard.up(key);
      }
    };
    await walkUntil('d', () => north().x < -11);
    // Leave room for input and network latency before the door leaves.
    await walkUntil('w', () => north().z > -6.55);
    await walkUntil('d', () => north().x < -14.2);
    await walkUntil('w', () => north().z > -2.95);
    expect(north().y).toBeCloseTo(0.965, 1);
    await page.screenshot({ path: 'test-results/bp24-shipment-tunnel.png' });
    await walkUntil('w', () => north().z > 2.7);
    const stats = await page.locator('.telemetry').evaluate((element) => ({
      fps: Number((element as HTMLElement).dataset.fps),
      frameMs: Number((element as HTMLElement).dataset.frameMs),
      draws: Number((element as HTMLElement).dataset.draws),
    }));
    console.log('Shipment performance preset on the test machine', stats);
    expect(stats.draws).toBeLessThan(24);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'ROOM LOBBY' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'LEAVE ROOM' })
      .click();
    await expect(
      page.locator('canvas[aria-label="The Depot training arena"]'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close rooms' }).click();
    await page.getByRole('button', { name: 'RESUME TRAINING' }).click();
    await expect(page.getByTestId('dummy-status')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await guest.leave();
  }
});
