import { expect, test } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

declare global {
  interface Window {
    footstepStarts: number;
    footstepBearings: { x: number; z: number }[];
  }
}

test('local movement plays footsteps and a remote player is heard in 3D', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({ preset: 'performance' }),
    );
    window.footstepStarts = 0;
    window.footstepBearings = [];
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this);
      const start = source.start.bind(source);
      source.start = (...args) => {
        if (source.buffer?.sampleRate === 22050) window.footstepStarts++;
        start(...args);
      };
      return source;
    };
    const createPanner = AudioContext.prototype.createPanner;
    AudioContext.prototype.createPanner = function () {
      const panner = createPanner.call(this);
      const setPosition = panner.setPosition.bind(panner);
      panner.setPosition = (x, y, z) => {
        if (panner.panningModel === 'HRTF')
          window.footstepBearings.push({ x, z });
        setPosition(x, y, z);
      };
      return panner;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Listener');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const code = await page.getByTestId('room-code').textContent();
  const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    code!,
    { name: 'Runner' },
  );
  for (const message of ['correction', 'notice', 'shot', 'kill'])
    guest.onMessage(message, () => {});
  let seq = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    guest.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await enterStartedMatch(page);

    await page.keyboard.down('KeyA');
    await expect
      .poll(() => page.evaluate(() => window.footstepStarts))
      .toBeGreaterThan(0);
    await page.keyboard.up('KeyA');
    expect(await page.evaluate(() => window.footstepBearings)).toHaveLength(0);

    const runner = () => guest.state.players.get(guest.sessionId)!;
    const life = runner().life;
    let forward = 1;
    const packet = () => ({
      seq: ++seq,
      life,
      forward,
      right: 0,
      yaw: 0,
      pitch: 0,
      sprint: false,
      jump: false,
      jumpPressed: false,
      slidePressed: false,
      divePressed: false,
      weapon: {
        fire: false,
        firePressed: false,
        aim: false,
        reloadPressed: false,
        switchTo: null,
      },
    });
    timer = setInterval(() => {
      // Keep the runner in the open lane while the listener turns around.
      if (runner().z < 9.2) forward = -1;
      if (runner().z > 11.4) forward = 1;
      guest.send('input', [packet(), packet()]);
    }, 1000 / 30);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.footstepBearings.some(({ x, z }) => x > 2 && z < -0.15),
        ),
      )
      .toBe(true);

    await page.evaluate(() => {
      window.footstepBearings.length = 0;
      document.dispatchEvent(
        new MouseEvent('mousemove', { movementX: Math.PI / 0.002 }),
      );
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.footstepBearings.some(({ x, z }) => x < -2 && z > 0.15),
        ),
      )
      .toBe(true);
  } finally {
    clearInterval(timer);
    await guest.leave();
  }
});
