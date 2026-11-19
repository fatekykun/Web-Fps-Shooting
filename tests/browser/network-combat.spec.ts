import { enterStartedMatch } from './helpers/matchEntry';
import { expect, test } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import type { KillEvent } from '@breakpoint/shared/combat';

test('server-confirmed hits, ammo, kill feed, death and respawn work through the browser', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let target: Room<unknown, RoomState> | undefined,
    attacker: Room<unknown, RoomState> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Raven');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    const client = new Client('http://127.0.0.1:2567');
    target = await client.joinById<RoomState>(code!, { name: 'Target' });
    const kills: KillEvent[] = [];
    target.onMessage('kill', (kill: KillEvent) => kills.push(kill));
    target.onMessage('shot', () => {});
    target.onMessage('correction', () => {});
    target.onMessage('notice', () => {});
    target.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await expect(page.getByTestId('player-health')).toHaveAttribute(
      'data-health',
      '100',
    );
    await expect(page.getByTestId('dummy-status')).toHaveCount(0);
    await page.evaluate(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          movementX: Math.PI / 2 / 0.002,
          movementY: 60,
        }),
      ),
    );
    await page.mouse.down();
    await expect.poll(() => kills.length).toBe(1);
    await page.mouse.up();
    await expect(page.getByRole('list', { name: 'Kill feed' })).toContainText(
      'Target',
    );
    await expect
      .poll(async () =>
        Number(
          await page.getByTestId('weapon-status').getAttribute('data-ammo'),
        ),
      )
      .toBeLessThan(30);
    await expect
      .poll(async () =>
        Number(
          await page.getByTestId('weapon-status').getAttribute('data-hits'),
        ),
      )
      .toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/server-confirmed-combat.png' });

    attacker = await client.joinById<RoomState>(code!, { name: 'Attacker' });
    for (const type of ['shot', 'kill', 'correction', 'notice'])
      attacker.onMessage(type, () => {});
    let sequence = 0,
      firing = true;
    timer = setInterval(() => {
      const packet = () => ({
        seq: ++sequence,
        life: 1,
        forward: 0,
        right: 0,
        yaw: Math.PI / 2,
        pitch: -0.07,
        sprint: false,
        jump: false,
        jumpPressed: false,
        slidePressed: false,
        divePressed: false,
        weapon: {
          fire: firing,
          firePressed: firing,
          aim: true,
          reloadPressed: false,
          switchTo: null,
        },
      });
      attacker!.send('input', [packet(), packet()]);
    }, 1000 / 30);
    await expect(page.getByTestId('death-notice')).toBeVisible({
      timeout: 20000,
    });
    firing = false;
    await page.screenshot({ path: 'test-results/server-death.png' });
    await expect(page.getByTestId('player-health')).toHaveAttribute(
      'data-life',
      '2',
      { timeout: 10000 },
    );
    await expect(page.getByTestId('player-health')).toHaveAttribute(
      'data-alive',
      'true',
    );
    await expect(page.getByTestId('player-health')).toHaveAttribute(
      'data-health',
      '100',
    );
    await expect(page.getByTestId('death-notice')).toHaveCount(0);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-ammo',
      '30',
    );
    expect(errors).toEqual([]);
  } finally {
    if (timer) clearInterval(timer);
    await target?.leave();
    await attacker?.leave();
  }
});
