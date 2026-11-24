import { expect, test } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { ServerShot } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { arenas } from '@breakpoint/shared/maps';
import { enterStartedMatch } from './helpers/matchEntry';

test('plays Killhouse from the raised team spawn to the watchtower', async ({
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
  await page.getByLabel('PLAYER NAME').fill('Watchtower');
  await page.getByLabel('MAP').selectOption('killhouse');
  await page.getByLabel('GAME MODE').selectOption('tdm');
  await expect(page.getByLabel('MAP')).toHaveValue('killhouse');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'KILLHOUSE / PRIVATE SESSION',
  );
  const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    (await page.getByTestId('room-code').textContent())!,
    { name: 'South' },
  );
  const shots: ServerShot[] = [];
  guest.onMessage('shot', (shot: ServerShot) => shots.push(shot));
  for (const type of ['notice', 'kill', 'correction'])
    guest.onMessage(type, () => {});
  try {
    await expect.poll(() => guest.state.mapId).toBe('killhouse');
    guest.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await expect(
      page.locator('canvas[aria-label="Killhouse indoor training warehouse"]'),
    ).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Map and match' }),
    ).toContainText('KILLHOUSE');
    const north = () => guest.state.players.get(guest.state.hostId)!;
    const south = () => guest.state.players.get(guest.sessionId)!;
    expect(north().z).toBeCloseTo(-16.1);
    expect(south().z).toBeCloseTo(16.1);
    expect(north().y).toBeGreaterThan(2.3);
    expect(south().y).toBeGreaterThan(2.3);
    expect(north().yaw).toBeCloseTo(Math.PI);
    expect(south().yaw).toBeCloseTo(0);
    await expect(page.getByTestId('match-start-signal')).toBeHidden();
    await page.screenshot({ path: 'test-results/bp23-killhouse-spawn.png' });

    const hold = async (key: string, reached: () => boolean) => {
      await page.keyboard.down(key);
      try {
        await expect
          .poll(reached, { timeout: 5000, intervals: [40] })
          .toBe(true);
      } finally {
        await page.keyboard.up(key);
      }
    };
    await hold('a', () => north().x > -5.8);
    await hold('w', () => north().z > -9.6);
    expect(north().y).toBeLessThan(1.05);
    await hold('a', () => north().x > -0.49);
    await hold('w', () => north().z > -1.9 && north().y > 4.2);
    expect(north().y).toBeCloseTo(arenas.killhouse.towerHeight + 0.885, 1);
    const predictedY = Number(
      await page.getByTestId('position').getAttribute('data-y'),
    );
    expect(predictedY).toBeCloseTo(north().y, 0);
    await page.screenshot({
      path: 'test-results/bp23-killhouse-tower-gameplay.png',
    });

    await page.mouse.down();
    try {
      await expect.poll(() => shots.length).toBeGreaterThan(0);
    } finally {
      await page.mouse.up();
    }
    expect(shots[0]!.traces[0]!.end.z).toBeCloseTo(18, 2);
    const metrics = await page.locator('.telemetry').evaluate((element) => ({
      fps: Number((element as HTMLElement).dataset.fps),
      frameMs: Number((element as HTMLElement).dataset.frameMs),
      draws: Number((element as HTMLElement).dataset.draws),
    }));
    console.log('Killhouse Performance preset on the test machine', metrics);
    expect(metrics.draws).toBeLessThan(24);
    expect(errors).toEqual([]);
  } finally {
    await guest.leave();
  }
});
