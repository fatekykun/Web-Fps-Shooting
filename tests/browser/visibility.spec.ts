import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { PerspectiveCamera, Vector3 } from 'three';
import { movementConfig } from '@breakpoint/shared';
import { avatarScale, standingAnchor } from '@breakpoint/shared/avatar';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

async function cyanPixels(
  page: Page,
  target: { x: number; y: number; z: number; halfHeight: number },
) {
  const position = await page.getByTestId('position').evaluate((element) => ({
    x: Number(element.dataset.x),
    y: Number(element.dataset.y),
    z: Number(element.dataset.z),
  }));
  const camera = new PerspectiveCamera(85, 1280 / 720, 0.08, 60);
  camera.position.set(
    position.x,
    position.y + movementConfig.eyeOffset,
    position.z,
  );
  camera.updateMatrixWorld();
  const pixels = [];
  for (const x of [-0.55, 0.55])
    for (const y of [0.01, 1.7]) {
      const point = new Vector3(
        target.x + x,
        target.y - standingAnchor + y * avatarScale(target.halfHeight),
        target.z,
      ).project(camera);
      pixels.push({ x: (point.x + 1) * 640, y: (1 - point.y) * 360 });
    }
  const rect = {
    left: Math.floor(Math.min(...pixels.map((p) => p.x))) - 2,
    right: Math.ceil(Math.max(...pixels.map((p) => p.x))) + 2,
    top: Math.floor(Math.min(...pixels.map((p) => p.y))) - 2,
    bottom: Math.ceil(Math.max(...pixels.map((p) => p.y))) + 2,
  };
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, bounds) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const gl = canvas.getContext('webgl2')!;
          const width = bounds.right - bounds.left,
            height = bounds.bottom - bounds.top;
          const bytes = new Uint8Array(width * height * 4);
          gl.readPixels(
            bounds.left,
            canvas.height - bounds.bottom,
            width,
            height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bytes,
          );
          let count = 0;
          for (let i = 0; i < bytes.length; i += 4)
            if (
              bytes[i + 2]! > bytes[i]! * 1.25 &&
              bytes[i + 1]! > bytes[i]! * 1.3
            )
              count++;
          resolve(count);
        });
      }),
    rect,
  );
}

test('remote silhouettes remain readable at 16–24 m and disappear behind solid cover', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  let target: Room<unknown, RoomState> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let sequence = 0,
    forward = 0,
    right = 0;
  const movementPoll = { intervals: [50], timeout: 20000 };
  try {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'ENTER TRAINING' }),
    ).toBeEnabled();
    await page.getByLabel('Adaptive resolution', { exact: true }).uncheck();
    await page.getByLabel('Resolution preset').selectOption('balanced');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Visibility viewer');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = (await page.getByTestId('room-code').textContent())!;
    target = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
      code,
      { name: 'Visibility target' },
    );
    target.onMessage('correction', () => {});
    target.onMessage('notice', () => {});
    target.onMessage('shot', () => {});
    target.onMessage('kill', () => {});
    target.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await expect.poll(() => target!.state.phase).toBe('playing');
    timer = setInterval(() => {
      // Keep this SDK-only actor at most one batch ahead. Unlike the game client,
      // it has no prediction/reconciliation; queued inputs can otherwise carry it
      // past a waypoint when software rendering slows the shared test machine.
      if (target!.state.players.get(target!.sessionId)!.ack < sequence) return;
      target!.send(
        'input',
        [0, 1].map(() => ({
          seq: ++sequence,
          life: target!.state.players.get(target!.sessionId)!.life,
          forward,
          right,
          yaw: 0,
          pitch: 0,
          sprint: false,
          jump: false,
          jumpPressed: false,
          slidePressed: false,
          divePressed: false,
        })),
      );
    }, 1000 / 30);
    await page.getByRole('button', { name: 'BACK TO ARENA' }).click();
    await page.getByRole('button', { name: 'ENTER ROOM' }).click();
    await expect(page.locator('.crosshair')).toBeVisible();
    await page.keyboard.down('d');
    await expect
      .poll(
        async () =>
          Number(await page.getByTestId('position').getAttribute('data-x')),
        movementPoll,
      )
      .toBeGreaterThan(-0.5);
    await page.keyboard.up('d');
    await expect
      .poll(
        async () => Number(await page.getByTestId('speed').textContent()),
        movementPoll,
      )
      .toBeLessThan(0.1);
    const peer = () => target!.state.players.get(target!.sessionId)!;
    right = 1;
    await expect.poll(() => peer().x, movementPoll).toBeGreaterThan(-2.2);
    right = 0;
    forward = 1;
    await expect.poll(() => peer().z, movementPoll).toBeLessThan(-3.5);
    forward = 0;
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/bp01-enemy-medium.png' });
    expect(await cyanPixels(page, peer())).toBeGreaterThan(30);
    forward = 1;
    await expect.poll(() => peer().z, movementPoll).toBeLessThan(-9.5);
    forward = 0;
    await page.waitForTimeout(500);
    expect(await cyanPixels(page, peer())).toBeGreaterThan(12);
    await page.screenshot({ path: 'test-results/bp01-enemy-distant.png' });
    right = -1;
    await expect.poll(() => peer().x, movementPoll).toBeLessThan(-7);
    right = 0;
    await page.waitForTimeout(500);
    expect(await cyanPixels(page, peer())).toBeLessThan(5);
    await page.screenshot({ path: 'test-results/bp01-enemy-occluded.png' });
    expect(errors).toEqual([]);
  } finally {
    if (timer) clearInterval(timer);
    await page.keyboard.up('d');
    await target?.leave();
  }
});
