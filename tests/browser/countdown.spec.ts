import { expect, test } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import type { OwnerCombat } from '@breakpoint/shared/combat';
import { enterStartedMatch } from './helpers/matchEntry';

test('five-second countdown accepts separate player loadouts, freezes early input and plays the start cue', async ({
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
    const capture = window as unknown as { countdownAudio: number[] };
    capture.countdownAudio = [];
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = create.call(this),
        set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
      oscillator.frequency.setValueAtTime = (value, time) => {
        capture.countdownAudio.push(value);
        return set(value, time);
      };
      return oscillator;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Countdown host');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    (await page.getByTestId('room-code').textContent())!,
    { name: 'Countdown guest' },
  );
  let timer: ReturnType<typeof setInterval> | undefined,
    seq = 0,
    owner: OwnerCombat | undefined;
  const shots: unknown[] = [];
  guest.onMessage('shot', (shot) => shots.push(shot));
  guest.onMessage('correction', (value: { combat?: OwnerCombat }) => {
    owner = value.combat;
  });
  for (const type of ['notice', 'kill']) guest.onMessage(type, () => {});
  try {
    guest.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    const countdown = page.getByTestId('match-countdown');
    await expect(countdown.locator('strong')).toHaveText('5');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    const smg = page.getByRole('button', { name: 'Equip SM-02 / SMG' });
    await smg.click();
    await expect(smg).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => guest.state.phase).toBe('countdown');
    guest.send('loadout', {
      round: guest.state.round,
      life: guest.state.players.get(guest.sessionId)!.life,
      weapon: 'shotgun',
    });
    const host = () => guest.state.players.get(guest.state.hostId)!;
    const hostZ = host().z,
      guestZ = guest.state.players.get(guest.sessionId)!.z;
    timer = setInterval(() => {
      if (guest.state.phase !== 'countdown') return;
      const state = guest.state.players.get(guest.sessionId)!;
      guest.send(
        'input',
        [0, 1].map(() => ({
          seq: ++seq,
          life: state.life,
          forward: 1,
          right: 0,
          yaw: 0,
          pitch: 0,
          sprint: true,
          jump: false,
          jumpPressed: false,
          slidePressed: false,
          divePressed: false,
          weapon: {
            fire: true,
            firePressed: true,
            aim: true,
            reloadPressed: false,
            switchTo: null,
          },
        })),
      );
    }, 1000 / 30);
    await page.screenshot({ path: 'test-results/countdown-loadout.png' });
    for (const seconds of ['4', '3', '2'])
      await expect(countdown.locator('strong')).toHaveText(seconds);
    expect(host().z).toBeCloseTo(hostZ, 4);
    expect(guest.state.players.get(guest.sessionId)!.z).toBeCloseTo(guestZ, 4);
    expect(owner?.ammo.rifle.magazine).toBe(30);
    expect(shots).toHaveLength(0);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-ammo',
      '30',
    );
    await expect(page.getByTestId('match-timer')).toHaveText('5:00');
    await expect(countdown.locator('strong')).toHaveText('1');
    clearInterval(timer);
    timer = undefined;
    await expect(page.getByTestId('match-status')).toHaveAttribute(
      'data-phase',
      'playing',
    );
    await expect(page.getByTestId('match-start-signal')).toHaveText(
      'MATCH START',
    );
    await expect(page.getByTestId('match-timer')).toHaveText('5:00');
    await expect(countdown).toHaveCount(0);
    expect(shots).toHaveLength(0);
    expect(owner?.ammo.rifle.magazine).toBe(30);
    await expect.poll(() => owner?.selected).toBe('shotgun');
    await expect.poll(() => host().weapon).toBe('smg');
    const frequencies = await page.evaluate(
      () => (window as unknown as { countdownAudio: number[] }).countdownAudio,
    );
    expect(frequencies.filter((value) => value === 880)).toHaveLength(5);
    expect(frequencies.filter((value) => value === 440)).toHaveLength(1);
    expect(frequencies.filter((value) => value === 660)).toHaveLength(1);
    await enterStartedMatch(page);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'smg',
    );
    await page.keyboard.down('w');
    await expect.poll(() => host().z).toBeLessThan(hostZ - 0.5);
    await page.keyboard.up('w');
    await page.mouse.down();
    await page.waitForTimeout(32);
    await page.mouse.up();
    await expect.poll(() => shots.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    if (timer) clearInterval(timer);
    await guest.leave();
  }
});
