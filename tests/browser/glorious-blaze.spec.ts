import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { movementConfig } from '@breakpoint/shared';
import { avatarParts, standingAnchor } from '@breakpoint/shared/avatar';
import type { KillEvent, ServerShot } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

async function prepare(page: Page, equipped = false) {
  await page.addInitScript((equipped) => {
    if (equipped && !localStorage.getItem('breakpoint.settings.v1'))
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ shotgunSkin: 'glorious-blaze' }),
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
      const duration = Math.round(buffer.duration * 1000);
      const data = document.documentElement.dataset;
      if (duration === 825) data.blazeShotReady = 'true';
      if (duration === 1795) data.blazeKillReady = 'true';
      return buffer;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      start.apply(this, args);
      const duration = Math.round((this.buffer?.duration ?? 0) * 1000);
      const data = document.documentElement.dataset;
      if (duration === 825)
        data.blazeShots = String(Number(data.blazeShots ?? 0) + 1);
      if (duration !== 1795) return;
      data.blazeKills = String(Number(data.blazeKills ?? 0) + 1);
      const onset = this.context.currentTime;
      const capture = () => {
        if (this.context.currentTime - onset >= 0.24)
          data.blazeFrame = document.querySelector('canvas')!.toDataURL();
        else requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
    };
  }, equipped);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text());
  });
  return errors;
}

async function sight(page: Page) {
  const hud = page.getByTestId('weapon-status');
  await expect(hud).toHaveAttribute('data-shotgun-skin-status', 'ready');
  await expect(hud).toContainText('HIP FIRE');
  await expect(page.locator('html')).toHaveAttribute(
    'data-blaze-shot-ready',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-blaze-kill-ready',
    'true',
  );
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
  await page.waitForTimeout(90);
  await page.mouse.up();
}

async function verifyEffect(page: Page, path: string) {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-blaze-kills', '1');
  await expect(html).toHaveAttribute(
    'data-blaze-frame',
    /^data:image\/png;base64,/,
  );
  const url = (await html.getAttribute('data-blaze-frame'))!;
  await writeFile(path, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  const glow = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ctx = new OffscreenCanvas(image.width, image.height).getContext(
      '2d',
    )!;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(
      image.width * 0.4,
      image.height * 0.28,
      image.width * 0.2,
      image.height * 0.44,
    );
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        data[i]! > 238 &&
        data[i + 1]! > 130 &&
        data[i + 2]! + 25 < data[i + 1]!
      )
        count++;
    return count;
  }, url);
  expect(glow).toBeGreaterThan(75);
}

test('Glorious Blaze saves in Loadouts and plays its assigned sound and animation in training', async ({
  page,
}, testInfo) => {
  const errors = await prepare(page);
  await page.goto('/');
  const armory = page.getByRole('button', { name: 'LOADOUTS', exact: true });
  const shotgun = page.getByRole('button', {
    name: /^Loadout 3/,
  });
  const skin = page.getByLabel('Change Skin');
  await armory.click();
  await shotgun.click();
  await skin.selectOption({ label: 'Glorious Blaze' });
  await page.getByRole('button', { name: 'Save Loadout' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await page.keyboard.press('3');
  const hud = page.getByTestId('weapon-status');
  const dummy = page.getByTestId('dummy-status');
  const html = page.locator('html');
  await expect(hud).toContainText('SG-03 / GLORIOUS BLAZE');
  await expect(hud).toContainText('HIP FIRE');
  await page.keyboard.press('i');
  await expect(hud).toHaveAttribute('data-inspecting', 'true');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: testInfo.outputPath('glorious-blaze-inspect.png'),
  });
  await sight(page);
  await page.screenshot({
    path: testInfo.outputPath('glorious-blaze-ads.png'),
  });
  await moveAim(page, 0, -580);
  await fire(page);
  await expect(html).toHaveAttribute('data-blaze-shots', '1');
  await expect(dummy).toHaveAttribute('data-health', '100');
  expect(await html.getAttribute('data-blaze-kills')).toBeNull();
  await moveAim(page, 0, 580);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.down('w');
  await expect
    .poll(
      () => page.getByTestId('position').getAttribute('data-z').then(Number),
      { intervals: [50] },
    )
    .toBeLessThan(3);
  await page.keyboard.up('w');
  await sight(page);
  for (
    let shot = 0;
    shot < 4 && !(await html.getAttribute('data-blaze-kills'));
    shot++
  ) {
    await fire(page);
    if (!(await html.getAttribute('data-blaze-kills')))
      await page.waitForTimeout(940);
  }
  await expect(dummy).toHaveAttribute('data-resetting', 'true');
  await verifyEffect(page, testInfo.outputPath('glorious-blaze-training.png'));
  await page.mouse.up({ button: 'right' });
  await page.reload();
  await armory.click();
  await shotgun.click();
  await expect(skin).toHaveValue('glorious-blaze');
  expect(errors).toEqual([]);
});

test('the room server relays Glorious Blaze shots and the confirmed shotgun elimination', async ({
  page,
}, testInfo) => {
  const errors = await prepare(page, true);
  const peers: Room<unknown, RoomState>[] = [];
  const shots: ServerShot[] = [];
  const kills: KillEvent[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Blaze');
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
    await page.getByRole('button', { name: 'Equip Loadout 3' }).click();
    await enterStartedMatch(page);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'shotgun',
    );
    const state = peers[0]!.state;
    const shooter = state.players.get(state.hostId)!;
    const victim = state.players.get(peers[1]!.sessionId)!;
    const dx = victim.x - shooter.x;
    const dz = victim.z - shooter.z;
    const chest = avatarParts.find((part) => part.region === 'upperTorso')!
      .position[1];
    const yaw = Math.atan2(-dx, -dz) - shooter.yaw;
    const pitch =
      Math.atan2(
        victim.y -
          standingAnchor +
          chest -
          (shooter.y + movementConfig.eyeOffset),
        Math.hypot(dx, dz),
      ) - shooter.pitch;
    await moveAim(
      page,
      -yaw / movementConfig.sensitivity,
      -pitch / movementConfig.sensitivity,
    );
    await sight(page);
    await page.waitForTimeout(1100);
    for (let shot = 0; shot < 5 && !kills.length; shot++) {
      await fire(page);
      if (!kills.length) await page.waitForTimeout(935);
    }
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({
      killerId: shooter.id,
      victimId: victim.id,
      weapon: 'shotgun',
      effect: 'glorious-blaze',
      position: { x: victim.x, y: victim.y - standingAnchor, z: victim.z },
    });
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots)
      expect(shot).toMatchObject({
        weapon: 'shotgun',
        shotgunSkin: 'glorious-blaze',
        shooter: shooter.id,
      });
    await verifyEffect(
      page,
      testInfo.outputPath('glorious-blaze-private-room.png'),
    );
    await page.mouse.up({ button: 'right' });
    expect(errors).toEqual([]);
  } finally {
    for (const peer of peers) await peer.leave();
  }
});
