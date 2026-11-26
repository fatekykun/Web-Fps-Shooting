import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { movementConfig, weaponConfigs } from '@breakpoint/shared';
import { standingAnchor, avatarParts } from '@breakpoint/shared/avatar';
import type { KillEvent, ServerShot } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

async function prepare(page: Page, equipped = false) {
  await page.addInitScript((equipped) => {
    if (!localStorage.getItem('breakpoint.settings.v1'))
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({
          smgSkin: equipped ? 'neon-blade' : 'standard',
          autoReload: false,
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
      if (milliseconds === 250) data.neonShotReady = 'true';
      if (milliseconds === 1500) data.neonKillReady = 'true';
      return buffer;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      start.apply(this, args);
      const milliseconds = Math.round((this.buffer?.duration ?? 0) * 1000);
      const data = document.documentElement.dataset;
      if (milliseconds === 250)
        data.neonShots = String(Number(data.neonShots ?? 0) + 1);
      if (milliseconds !== 1500) return;
      data.neonKills = String(Number(data.neonKills ?? 0) + 1);
      const onset = this.context.currentTime;
      const capture = () => {
        if (this.context.currentTime - onset >= 0.74)
          data.neonFrame = document.querySelector('canvas')!.toDataURL();
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

async function moveAim(page: Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) =>
      document.dispatchEvent(
        new MouseEvent('mousemove', { movementX: x, movementY: y }),
      ),
    { x, y },
  );
}

async function aim(page: Page) {
  const hud = page.getByTestId('weapon-status');
  await expect(hud).toHaveAttribute('data-smg-skin-status', 'ready');
  await expect(page.locator('html')).toHaveAttribute(
    'data-neon-shot-ready',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-neon-kill-ready',
    'true',
  );
  await page.mouse.down({ button: 'right' });
  await expect
    .poll(() => hud.getAttribute('data-ads').then(Number))
    .toBeGreaterThan(0.999);
}

async function flashPixels(page: Page, png: string, area: 'display' | 'arena') {
  return page.evaluate(
    async ({ png, area }) => {
      const image = new Image();
      image.src = png;
      await image.decode();
      const ctx = new OffscreenCanvas(image.width, image.height).getContext(
        '2d',
      )!;
      ctx.drawImage(image, 0, 0);
      const center = image.width / 2;
      const height = image.height;
      const { data } =
        area === 'display'
          ? ctx.getImageData(
              center - height * 0.007,
              height * 0.563,
              height * 0.054,
              height * 0.056,
            )
          : ctx.getImageData(
              center - 0.15 * height,
              height * 0.32,
              0.3 * height,
              0.37 * height,
            );
      let cyan = 0;
      let red = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!,
          g = data[i + 1]!,
          b = data[i + 2]!;
        if (b > 190 && g > 140 && g - r > 35) cyan++;
        if (r > 145 && g < 180 && b < 165 && r - g > 65) red++;
      }
      return { cyan, red };
    },
    { png, area },
  );
}

async function ammoPixels(page: Page) {
  const frame = await page.locator('canvas').screenshot();
  return flashPixels(
    page,
    `data:image/png;base64,${frame.toString('base64')}`,
    'display',
  );
}

async function verifyElimination(page: Page, path: string) {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-neon-kills', '1');
  await expect(html).toHaveAttribute(
    'data-neon-frame',
    /^data:image\/png;base64,/,
  );
  const url = (await html.getAttribute('data-neon-frame'))!;
  await writeFile(path, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  expect((await flashPixels(page, url, 'arena')).cyan).toBeGreaterThan(250);
}

test('Neon Blade renders a cyan magazine counter, flashes red below 20%, then resets on reload', async ({
  page,
}, testInfo) => {
  const errors = await prepare(page);
  await page.goto('/');
  const armory = page.getByRole('button', { name: 'ARMORY', exact: true });
  const smg = page.getByRole('button', { name: 'SM-02 / SMG', exact: true });
  const skin = page.getByLabel('SMG skin');
  await armory.click();
  await smg.click();
  await skin.selectOption({ label: 'Neon Blade' });
  await page.getByRole('button', { name: 'Close armory' }).click();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await page.keyboard.press('2');
  const hud = page.getByTestId('weapon-status');
  await expect(hud).toContainText('SM-02 / NEON BLADE');
  await expect(hud).toContainText('HIP FIRE');
  await page.keyboard.press('i');
  await expect(hud).toHaveAttribute('data-inspecting', 'true');
  await page.waitForTimeout(520);
  await page.screenshot({
    path: testInfo.outputPath('neon-blade-inspect.png'),
  });
  await aim(page);
  const capacity = weaponConfigs.smg.magazine;
  await expect(hud).toHaveAttribute('data-ammo', String(capacity));
  const normal = await ammoPixels(page);
  expect(normal.cyan).toBeGreaterThan(12);
  await page.screenshot({ path: testInfo.outputPath('neon-counter-full.png') });
  await moveAim(page, 0, -480);
  await page.mouse.down();
  await expect
    .poll(() => hud.getAttribute('data-ammo').then(Number), { intervals: [70] })
    .toBeLessThan(capacity * 0.2);
  await page.mouse.up();
  const html = page.locator('html');
  await expect
    .poll(() => html.getAttribute('data-neon-shots').then(Number))
    .toBeGreaterThan(0);
  expect(await html.getAttribute('data-neon-kills')).toBeNull();
  await expect
    .poll(async () => (await ammoPixels(page)).red)
    .toBeGreaterThan(normal.red + 8);
  await page.screenshot({ path: testInfo.outputPath('neon-counter-low.png') });
  await page.keyboard.press('r');
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await expect(hud).toHaveAttribute('data-ammo', String(capacity));
  await expect
    .poll(async () => (await ammoPixels(page)).cyan)
    .toBeGreaterThan(12);
  await expect
    .poll(() => hud.getAttribute('data-ads').then(Number))
    .toBeGreaterThan(0.999);
  await moveAim(page, 0, 480);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.down('w');
  await expect
    .poll(() =>
      page.getByTestId('position').getAttribute('data-z').then(Number),
    )
    .toBeLessThan(1);
  await page.keyboard.up('w');
  await aim(page);
  for (
    let burst = 0;
    burst < 4 && !(await html.getAttribute('data-neon-kills'));
    burst++
  ) {
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.up();
    if (!(await html.getAttribute('data-neon-kills')))
      await page.waitForTimeout(700);
  }
  await verifyElimination(page, testInfo.outputPath('neon-blade-training.png'));
  await page.mouse.up({ button: 'right' });
  await page.reload();
  await armory.click();
  await smg.click();
  await expect(skin).toHaveValue('neon-blade');
  expect(errors).toEqual([]);
});

test('a confirmed private-room SMG kill plays the Neon Blade sound and world-space effect', async ({
  page,
}, testInfo) => {
  const errors = await prepare(page, true);
  const peers: Room<unknown, RoomState>[] = [];
  const kills: KillEvent[] = [];
  const shots: ServerShot[] = [];
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Neon');
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
      peer.onMessage('shot', (event: ServerShot) => {
        if (i === 0) shots.push(event);
      });
      peer.onMessage('kill', (event: KillEvent) => {
        if (i === 0) kills.push(event);
      });
      for (const event of ['notice', 'correction'])
        peer.onMessage(event, () => {});
      peer.send('ready', true);
    }
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);
    await page.keyboard.press('2');
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'smg',
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
    await aim(page);
    await page.waitForTimeout(1150);
    for (let burst = 0; burst < 4 && !kills.length; burst++) {
      await page.mouse.down();
      await page.waitForTimeout(255);
      await page.mouse.up();
      if (!kills.length) await page.waitForTimeout(700);
    }
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({
      weapon: 'smg',
      effect: 'neon-blade',
      killerId: shooter.id,
      victimId: victim.id,
      position: { x: victim.x, y: victim.y - standingAnchor, z: victim.z },
    });
    expect(shots[0]).toMatchObject({
      weapon: 'smg',
      smgSkin: 'neon-blade',
      shooter: shooter.id,
    });
    await verifyElimination(
      page,
      testInfo.outputPath('neon-blade-elimination.png'),
    );
    await page.mouse.up({ button: 'right' });
    expect(errors).toEqual([]);
  } finally {
    for (const peer of peers) await peer.leave();
  }
});
