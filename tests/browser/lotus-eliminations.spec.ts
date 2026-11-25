import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { standingAnchor, avatarParts } from '@breakpoint/shared/avatar';
import { movementConfig } from '@breakpoint/shared';
import type { KillEvent, ServerShot } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({ sniperSkin: 'lotus-lava', eliminationQuality: 'high' }),
    );
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'quality',
        adaptive: false,
        antiAliasing: 'off',
      }),
    );
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: WebGLContextAttributes,
    ) {
      return get.call(
        this,
        type,
        type === 'webgl2'
          ? { ...options, preserveDrawingBuffer: true }
          : options,
      );
    } as typeof get;
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = async function (...args) {
      const buffer = await decode.apply(this, args);
      const milliseconds = Math.round(buffer.duration * 1000);
      const data = document.documentElement.dataset;
      if (milliseconds === 1300) data.lotusShotReady = 'true';
      if (milliseconds === 2450) data.lotusKillReady = 'true';
      return buffer;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      start.apply(this, args);
      const milliseconds = Math.round((this.buffer?.duration ?? 0) * 1000);
      const data = document.documentElement.dataset;
      if (milliseconds === 1300)
        data.lotusShots = String(Number(data.lotusShots ?? 0) + 1);
      if (milliseconds !== 2450) return;
      data.lotusKills = String(Number(data.lotusKills ?? 0) + 1);
      const onset = this.context.currentTime;
      const capture = () => {
        if (this.context.currentTime - onset >= 0.63)
          data.lotusBloom = document.querySelector('canvas')!.toDataURL();
        else requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text());
  });
  return errors;
}

async function aim(page: Page) {
  const hud = page.getByTestId('weapon-status');
  const html = page.locator('html');
  await expect(hud).toHaveAttribute('data-sniper-skin-status', 'ready');
  await expect(html).toHaveAttribute('data-lotus-shot-ready', 'true');
  await expect(html).toHaveAttribute('data-lotus-kill-ready', 'true');
  await page.mouse.down({ button: 'right' });
  await expect
    .poll(() => hud.getAttribute('data-ads').then(Number))
    .toBeGreaterThan(0.999);
}

async function moveAim(page: Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) =>
      document.dispatchEvent(
        new MouseEvent('mousemove', { movementX: x, movementY: y }),
      ),
    { x, y },
  );
}

async function fire(page: Page) {
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
}

async function verifyBloom(page: Page, path: string) {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-lotus-kills', '1');
  await expect(html).toHaveAttribute(
    'data-lotus-bloom',
    /^data:image\/png;base64,/,
  );
  const url = (await html.getAttribute('data-lotus-bloom'))!;
  await writeFile(path, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  const molten = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ctx = new OffscreenCanvas(image.width, image.height).getContext(
      '2d',
    )!;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(
      image.width * 0.39,
      image.height * 0.38,
      image.width * 0.22,
      image.height * 0.46,
    );
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        data[i]! > 220 &&
        data[i + 1]! > 35 &&
        data[i + 1]! < 245 &&
        data[i + 2]! < 140 &&
        data[i]! - data[i + 1]! > 20
      )
        count++;
    return count;
  }, url);
  expect(molten).toBeGreaterThan(120);
}

test('Lotus Lava plays its gunshot on a miss and blooms only on a training elimination', async ({
  page,
}, testInfo) => {
  const errors = await prepare(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await page.keyboard.press('4');
  await aim(page);
  const html = page.locator('html');
  const hud = page.getByTestId('weapon-status');
  const dummy = page.getByTestId('dummy-status');
  await moveAim(page, 0, -320);
  await fire(page);
  await expect(html).toHaveAttribute('data-lotus-shots', '1');
  await expect(dummy).toHaveAttribute('data-health', '100');
  await expect(html).not.toHaveAttribute('data-lotus-kills', '1');
  await expect(hud).toHaveAttribute('data-cycling', 'false');
  await moveAim(page, 0, 320);
  await fire(page);
  await expect(html).toHaveAttribute('data-lotus-shots', '2');
  await expect(dummy).toHaveAttribute('data-resetting', 'true');
  await verifyBloom(page, testInfo.outputPath('lotus-bloom-training.png'));
  await expect(dummy).toHaveAttribute('data-health', '100');
  await page.mouse.up({ button: 'right' });
  expect(errors).toEqual([]);
});

test('private rooms relay the Lotus shot and authoritative bloom at the defeated player', async ({
  page,
}, testInfo) => {
  const errors = await prepare(page);
  const peers: Room<unknown, RoomState>[] = [];
  const kills: KillEvent[] = [];
  const shots: ServerShot[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Lotus');
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
      peer.onMessage('shot', (shot: ServerShot) => {
        if (i === 0) shots.push(shot);
      });
      peer.onMessage('kill', (kill: KillEvent) => {
        if (i === 0) kills.push(kill);
      });
      peer.onMessage('notice', () => {});
      peer.onMessage('correction', () => {});
      peer.send('ready', true);
    }
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await page.keyboard.press('4');
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'sniper',
    );
    const state = peers[0]!.state;
    const shooter = state.players.get(state.hostId)!;
    const victim = state.players.get(peers[1]!.sessionId)!;
    const dx = victim.x - shooter.x;
    const dz = victim.z - shooter.z;
    const yaw = Math.atan2(-dx, -dz) - shooter.yaw;
    const pitch =
      Math.atan2(
        victim.y -
          standingAnchor +
          avatarParts[0]!.position[1] -
          (shooter.y + movementConfig.eyeOffset),
        Math.hypot(dx, dz),
      ) - shooter.pitch;
    await moveAim(
      page,
      -yaw / movementConfig.sensitivity,
      -pitch / movementConfig.sensitivity,
    );
    await aim(page);
    await page.waitForTimeout(1150);
    await fire(page);
    await expect.poll(() => kills.length).toBe(1);
    expect(kills[0]).toMatchObject({
      killerId: shooter.id,
      victimId: victim.id,
      weapon: 'sniper',
      effect: 'lotus-lava',
      position: { x: victim.x, y: victim.y - standingAnchor, z: victim.z },
    });
    await expect.poll(() => shots.length).toBe(1);
    expect(shots[0]).toMatchObject({
      weapon: 'sniper',
      sniperSkin: 'lotus-lava',
      shooter: shooter.id,
    });
    await expect(page.locator('html')).toHaveAttribute('data-lotus-shots', '1');
    await verifyBloom(page, testInfo.outputPath('lotus-bloom-private.png'));
    await page.mouse.up({ button: 'right' });
    expect(errors).toEqual([]);
  } finally {
    for (const peer of peers) await peer.leave();
  }
});
