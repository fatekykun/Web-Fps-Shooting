import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { movementConfig } from '@breakpoint/shared';
import { avatarParts, standingAnchor } from '@breakpoint/shared/avatar';
import type { KillEvent } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

async function firePixels(page: Page): Promise<number> {
  const screenshot = await page.locator('canvas').screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const width = Math.round(image.width * 0.15);
    const height = Math.round(image.height * 0.13);
    const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
    ctx.drawImage(
      image,
      -Math.floor(image.width * 0.425),
      -Math.floor(image.height * 0.385),
    );
    const { data } = ctx.getImageData(0, 0, width, height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i]! > 215 &&
        data[i + 1]! > 40 &&
        data[i + 2]! < 150 &&
        data[i]! - data[i + 1]! > 26
      )
        count++;
    }
    return count;
  }, screenshot.toString('base64'));
}

async function prepareMoltenLava(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({
        loadouts: {
          defaultSlot: 0,
          slots: [
            { weapon: 'rifle', skin: 'cinder-wyrm' },
            { weapon: 'smg', skin: 'neon-blade' },
            { weapon: 'shotgun', skin: 'glorious-blaze' },
            { weapon: 'sniper', skin: 'lotus-lava' },
          ],
        },
        reducedMotion: false,
      }),
    );
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'quality',
        adaptive: false,
        antiAliasing: 'off',
      }),
    );
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (Math.round((this.buffer?.duration ?? 0) * 1000) === 1380) {
        const data = document.documentElement.dataset;
        data.moltenKills = String(Number(data.moltenKills ?? 0) + 1);
      }
      start.apply(this, args);
    };
  });
  return () =>
    page.evaluate(() =>
      Number(document.documentElement.dataset.moltenKills ?? 0),
    );
}

test('Molten Lava plays one custom sound and a world-space burst when it eliminates the training target', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', ({ message }) => errors.push(message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const plays = await prepareMoltenLava(page);
  await page.clock.install({ time: new Date('2026-11-26T00:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-26T01:00:00Z'));
  await page.clock.runFor(416);
  const dummy = page.getByTestId('dummy-status');
  const fire = async () => {
    await page.mouse.down();
    await page.clock.runFor(32);
    await page.mouse.up();
    await page.clock.runFor(192);
  };
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(880);
  for (const health of [75, 50, 25]) {
    await fire();
    await expect(dummy).toHaveAttribute('data-health', String(health));
    expect(await plays()).toBe(0);
    await page.clock.runFor(912);
  }
  const ordinary = await firePixels(page);
  await fire();
  await expect(dummy).toHaveAttribute('data-resetting', 'true');
  await expect.poll(plays).toBe(1);
  expect(await firePixels(page)).toBeGreaterThan(ordinary + 40);
  await page.mouse.up({ button: 'right' });
  await page.clock.runFor(224);
  await page.screenshot({
    path: testInfo.outputPath('molten-elimination.png'),
  });
  await page.clock.runFor(2100);
  await expect(dummy).toHaveAttribute('data-health', '100');
  expect(await plays()).toBe(1);
  expect(errors).toEqual([]);
});

test('Molten Lava uses the confirmed victim position and plays the effect once in a private match', async ({
  page,
}, testInfo) => {
  const plays = await prepareMoltenLava(page);
  const peers: Room<unknown, RoomState>[] = [];
  const kills: KillEvent[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Molten host');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    const client = new Client('http://127.0.0.1:2567');
    for (let i = 0; i < 7; i++) {
      const peer = await client.joinById<RoomState>(code!, {
        name: `Target${i}`,
      });
      peers.push(peer);
      peer.onMessage('kill', (kill: KillEvent) => {
        if (i === 0) kills.push(kill);
      });
      for (const kind of ['shot', 'correction', 'notice'])
        peer.onMessage(kind, () => {});
      peer.send('ready', true);
    }
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-rifle-skin',
      'cinder-wyrm',
    );
    const state = peers[0]!.state;
    const shooter = state.players.get(state.hostId)!;
    const victim = state.players.get(peers[1]!.sessionId)!;
    const dx = victim.x - shooter.x,
      dz = victim.z - shooter.z;
    const yaw = Math.atan2(-dx, -dz) - shooter.yaw;
    const pitch =
      Math.atan2(
        victim.y -
          standingAnchor +
          avatarParts[0]!.position[1] -
          (shooter.y + movementConfig.eyeOffset),
        Math.hypot(dx, dz),
      ) - shooter.pitch;
    await page.evaluate(
      ({ yaw, pitch, sensitivity }) => {
        document.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: -yaw / sensitivity,
            movementY: -pitch / sensitivity,
          }),
        );
      },
      { yaw, pitch, sensitivity: movementConfig.sensitivity },
    );
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(1800);
    const before = await firePixels(page);
    for (let shot = 0; shot < 6 && !kills.length; shot++) {
      await page.mouse.down();
      await page.waitForTimeout(41);
      await page.mouse.up();
      await page.waitForTimeout(180);
      if (!kills.length) await page.waitForTimeout(750);
    }
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({
      killerId: shooter.id,
      victimId: victim.id,
      weapon: 'rifle',
      position: { x: victim.x, y: victim.y - standingAnchor, z: victim.z },
    });
    await expect.poll(plays).toBe(1);
    expect(await firePixels(page)).toBeGreaterThan(before + 30);
    await page.screenshot({
      path: testInfo.outputPath('private-match-elimination.png'),
    });
    await page.mouse.up({ button: 'right' });
  } finally {
    for (const peer of peers) await peer.leave();
  }
});
