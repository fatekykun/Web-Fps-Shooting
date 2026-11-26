import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { movementConfig } from '@breakpoint/shared';
import { avatarParts, standingAnchor } from '@breakpoint/shared/avatar';
import type { KillEvent } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

async function prepare(page: Page, quality: 'high' | 'medium') {
  await page.addInitScript((quality) => {
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({
        rifleSkin: 'memento-mori',
        eliminationQuality: quality,
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
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: WebGLContextAttributes,
    ) {
      return getContext.call(
        this,
        type,
        type === 'webgl2'
          ? { ...options, preserveDrawingBuffer: true }
          : options,
      );
    } as typeof getContext;
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = async function (...args) {
      const buffer = await decode.apply(this, args);
      if (Math.round(buffer.duration * 1000) === 1790)
        document.documentElement.dataset.requiemLoaded = 'true';
      return buffer;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      start.apply(this, args);
      const duration = Math.round((this.buffer?.duration ?? 0) * 1000);
      if (duration !== 1790) return;
      const { dataset } = document.documentElement;
      dataset.requiemPlays = String(Number(dataset.requiemPlays ?? 0) + 1);
      const onset = this.context.currentTime;
      const capture = () => {
        const elapsed = this.context.currentTime - onset;
        if (elapsed > 0.32) {
          dataset.requiemFrame = document.querySelector('canvas')!.toDataURL();
        } else requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
    };
  }, quality);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return {
    errors,
    plays: () =>
      page.locator('html').getAttribute('data-requiem-plays').then(Number),
  };
}

async function aimRifle(page: Page) {
  const hud = page.getByTestId('weapon-status');
  await expect(hud).toHaveAttribute('data-rifle-skin-status', 'ready');
  await expect(page.locator('html')).toHaveAttribute(
    'data-requiem-loaded',
    'true',
  );
  await page.mouse.down({ button: 'right' });
  await expect
    .poll(() => hud.getAttribute('data-ads').then(Number))
    .toBeGreaterThan(0.999);
}

async function shoot(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  });
}

async function saveRupture(page: Page, path: string) {
  const html = page.locator('html');
  await expect(html).toHaveAttribute(
    'data-requiem-frame',
    /^data:image\/png;base64,/,
  );
  const url = (await html.getAttribute('data-requiem-frame'))!;
  await writeFile(path, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  const bright = await page.evaluate(async (src) => {
    const frame = new Image();
    frame.src = src;
    await frame.decode();
    const pixels = new OffscreenCanvas(frame.width, frame.height).getContext(
      '2d',
    )!;
    pixels.drawImage(frame, 0, 0);
    const { data } = pixels.getImageData(
      Math.floor(frame.width * 0.43),
      Math.floor(frame.height * 0.4),
      Math.floor(frame.width * 0.14),
      Math.floor(frame.height * 0.22),
    );
    let gold = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 230 && data[i + 1]! > 95 && data[i + 2]! < 140) gold++;
    return gold;
  }, url);
  expect(bright).toBeGreaterThan(30);
}

test('Soul Requiem plays and renders once on training elimination, then clears', async ({
  page,
}, testInfo) => {
  const { errors, plays } = await prepare(page, 'high');
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await aimRifle(page);
  const dummy = page.getByTestId('dummy-status');
  for (const health of [75, 50, 25]) {
    await shoot(page);
    await expect(dummy).toHaveAttribute('data-health', String(health));
    expect(await plays()).toBe(0);
    await page.waitForTimeout(950);
  }
  await shoot(page);
  await expect(dummy).toHaveAttribute('data-resetting', 'true');
  await expect.poll(plays).toBe(1);
  await saveRupture(page, testInfo.outputPath('soul-requiem-training.png'));
  await page.mouse.up({ button: 'right' });
  await expect(dummy).toHaveAttribute('data-health', '100');
  expect(await plays()).toBe(1);
  expect(errors).toEqual([]);
});

test('private matches broadcast the confirmed Soul Requiem victim and play the sound once', async ({
  page,
}, testInfo) => {
  const { errors, plays } = await prepare(page, 'medium');
  const peers: Room<unknown, RoomState>[] = [];
  const kills: KillEvent[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Requiem host');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    const client = new Client(
      process.env.BREAKPOINT_TEST_SERVER_URL ?? 'http://127.0.0.1:2567',
    );
    for (let i = 0; i < 7; i++) {
      const peer = await client.joinById<RoomState>(code!, {
        name: `Target${i}`,
      });
      peers.push(peer);
      peer.onMessage('kill', (kill: KillEvent) => {
        if (i === 0) kills.push(kill);
      });
      for (const event of ['shot', 'correction', 'notice'])
        peer.onMessage(event, () => {});
      peer.send('ready', true);
    }
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    const state = peers[0]!.state;
    const shooter = state.players.get(state.hostId)!;
    const victim = state.players.get(peers[1]!.sessionId)!;
    const dx = victim.x - shooter.x;
    const dz = victim.z - shooter.z;
    await page.evaluate(
      ({ yaw, pitch, sensitivity }) => {
        document.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: -yaw / sensitivity,
            movementY: -pitch / sensitivity,
          }),
        );
      },
      {
        yaw: Math.atan2(-dx, -dz) - shooter.yaw,
        pitch:
          Math.atan2(
            victim.y -
              standingAnchor +
              avatarParts[0]!.position[1] -
              (shooter.y + movementConfig.eyeOffset),
            Math.hypot(dx, dz),
          ) - shooter.pitch,
        sensitivity: movementConfig.sensitivity,
      },
    );
    await aimRifle(page);
    await page.waitForTimeout(1150);
    for (let shot = 0; shot < 6 && !kills.length; shot++) {
      await shoot(page);
      await page.waitForTimeout(180);
      if (!kills.length) await page.waitForTimeout(750);
    }
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({
      killerId: shooter.id,
      victimId: victim.id,
      weapon: 'rifle',
      position: { x: victim.x, y: victim.y - standingAnchor, z: victim.z },
      effect: 'soul-requiem',
    });
    await expect.poll(plays).toBe(1);
    await saveRupture(
      page,
      testInfo.outputPath('soul-requiem-private-room.png'),
    );
    await page.mouse.up({ button: 'right' });
    expect(errors).toEqual([]);
  } finally {
    for (const peer of peers) await peer.leave();
  }
});
