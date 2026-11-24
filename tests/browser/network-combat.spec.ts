import { enterStartedMatch, reserveSpawnSlot } from './helpers/matchEntry';
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
  const fillers: Room<unknown, RoomState>[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Raven');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    const client = new Client('http://127.0.0.1:2567');
    fillers.push(await reserveSpawnSlot(client, code!, 'South one'));
    target = await client.joinById<RoomState>(code!, { name: 'Target' });
    const kills: KillEvent[] = [];
    target.onMessage('kill', (kill: KillEvent) => kills.push(kill));
    target.onMessage('shot', () => {});
    target.onMessage('correction', () => {});
    target.onMessage('notice', () => {});
    target.send('ready', true);
    fillers.push(await reserveSpawnSlot(client, code!, 'South two'));
    attacker = await client.joinById<RoomState>(code!, { name: 'Attacker' });
    for (const type of ['shot', 'kill', 'correction', 'notice'])
      attacker.onMessage(type, () => {});
    attacker.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await expect(page.getByTestId('player-health')).toHaveAttribute(
      'data-health',
      '100',
    );
    await expect(page.getByTestId('dummy-status')).toHaveCount(0);
    const matchLife = Number(
      await page.getByTestId('player-health').getAttribute('data-life'),
    );
    await page.evaluate(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          movementX: -Math.PI / 2 / 0.002,
          movementY: 60,
        }),
      ),
    );
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(300);
    await page.mouse.down();
    await expect.poll(() => kills.length).toBe(1);
    await page.mouse.up();
    await page.mouse.up({ button: 'right' });
    expect(kills[0]).toMatchObject({
      killer: 'Raven',
      victim: 'Target',
      headshot: false,
    });
    const entry = page
      .getByRole('list', { name: 'Kill feed' })
      .getByRole('listitem')
      .filter({ hasText: 'Target' });
    await expect
      .poll(() =>
        entry.evaluateAll((items) =>
          items.map((item) => ({
            text: item.textContent?.replace(/\s/g, ''),
            icons: Array.from(item.querySelectorAll('[role="img"]'), (icon) =>
              icon.getAttribute('aria-label'),
            ),
          })),
        ),
      )
      .toEqual([{ text: 'RavenTarget', icons: ['Assault rifle'] }]);
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

    let sequence = 0,
      firing = true;
    timer = setInterval(() => {
      const packet = () => ({
        seq: ++sequence,
        life: attacker!.state.players.get(attacker!.sessionId)!.life,
        forward: 0,
        right: 0,
        yaw: Math.PI / 2,
        pitch: -0.075,
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
    const sniper = page.getByRole('button', { name: 'Equip SR-04 / SNIPER' });
    await sniper.click();
    await expect(sniper).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'test-results/server-death.png' });
    await expect(page.getByTestId('death-notice')).toHaveCount(0);
    await enterStartedMatch(page);
    await expect(page.getByTestId('player-health')).toHaveAttribute(
      'data-life',
      String(matchLife + 1),
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
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'sniper',
    );
    await expect
      .poll(() => target!.state.players.get(target!.state.hostId)?.weapon)
      .toBe('sniper');
    expect(errors).toEqual([]);
  } finally {
    if (timer) clearInterval(timer);
    await target?.leave();
    await attacker?.leave();
    await Promise.all(fillers.map((peer) => peer.leave()));
  }
});
