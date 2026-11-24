import { enterStartedMatch, reserveSpawnSlot } from './helpers/matchEntry';
import { expect, test } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { movementConfig } from '@breakpoint/shared';
import {
  characterParts,
  createRigTransforms,
  evaluateRig,
  partTransform,
  remoteWeaponGrips,
  rotatePoint,
  type CharacterPose,
} from '@breakpoint/shared/character';

function gripErrors(pose: CharacterPose) {
  const rig = createRigTransforms();
  evaluateRig(pose, rig);
  return (['left', 'right'] as const).map((side) => {
    const palm = partTransform(
      characterParts.find((part) => part.name === `${side}-hand`)!,
      rig,
      { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
    );
    const grip = remoteWeaponGrips[side],
      weapon = rig[21]!;
    const target = rotatePoint(weapon, grip.x, grip.y, grip.z, {
      x: 0,
      y: 0,
      z: 0,
    });
    return Math.hypot(
      palm.x - weapon.x - target.x,
      palm.y - weapon.y - target.y,
      palm.z - weapon.z - target.z,
    );
  });
}

test('tactical character poses synchronize through locomotion, landing, slide, reload and damage', async ({
  page,
}) => {
  test.setTimeout(120000);
  let peer: Room<unknown, RoomState> | undefined,
    filler: Room<unknown, RoomState> | undefined,
    timer: ReturnType<typeof setInterval> | undefined;
  let sequence = 0,
    forward = 0,
    right = 0,
    yaw = Math.PI / 2,
    pitch = 0,
    sprint = false,
    aim = false,
    fire = false;
  let jumpPressed = false,
    slidePressed = false,
    reloadPressed = false,
    firePressed = false;
  let lookYaw = Math.PI,
    lookPitch = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'quality',
        adaptive: false,
        antiAliasing: 'off',
      }),
    ),
  );
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Character viewer');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const client = new Client('http://127.0.0.1:2567');
    const code = (await page.getByTestId('room-code').textContent())!;
    filler = await reserveSpawnSlot(client, code);
    peer = await client.joinById<RoomState>(code, { name: 'Tactical actor' });
    for (const type of ['shot', 'kill', 'correction', 'notice'])
      peer.onMessage(type, () => {});
    peer.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    const actor = () => peer!.state.players.get(peer!.sessionId)!;
    timer = setInterval(() => {
      const state = actor();
      // Allow the two-input batches to run at 60 Hz despite 20 Hz state patches.
      if (!state || sequence - state.ack > 4) return;
      peer!.send(
        'input',
        [0, 1].map((index) => ({
          seq: ++sequence,
          life: state.life,
          forward,
          right,
          yaw,
          pitch,
          sprint,
          jump: false,
          jumpPressed: index === 0 && jumpPressed,
          slidePressed: index === 0 && slidePressed,
          divePressed: false,
          weapon: {
            fire,
            firePressed: index === 0 && firePressed,
            aim,
            reloadPressed: index === 0 && reloadPressed,
            switchTo: 'rifle',
          },
        })),
      );
      jumpPressed = slidePressed = reloadPressed = firePressed = false;
    }, 1000 / 30);
    await enterStartedMatch(page);
    yaw = 0;
    right = 1;
    await page.keyboard.down('a');
    await expect
      .poll(
        async () =>
          Number(await page.getByTestId('position').getAttribute('data-x')),
        { intervals: [50] },
      )
      .toBeGreaterThan(-5.8);
    await page.keyboard.up('a');
    await expect
      .poll(() => actor().x, { intervals: [50] })
      .toBeGreaterThan(-0.2);
    right = 0;
    // A three-quarter view shows both the grip and the weapon silhouette.
    yaw = Math.PI / 4;
    await page.waitForTimeout(350);
    const lookAtActor = async (height = 1.1) => {
      const viewer = [...peer!.state.players.values()].find(
        (p) => p.name === 'Character viewer',
      )!;
      const dx = actor().x - viewer.x,
        dz = actor().z - viewer.z;
      const nextYaw = Math.atan2(-dx, -dz),
        nextPitch = Math.atan2(
          actor().y - 0.885 + height - viewer.y - movementConfig.eyeOffset,
          Math.hypot(dx, dz),
        );
      await page.evaluate(
        ({ x, y }) =>
          document.dispatchEvent(
            new MouseEvent('mousemove', { movementX: x, movementY: y }),
          ),
        {
          x: -(nextYaw - lookYaw) / 0.002,
          y: -(nextPitch - lookPitch) / 0.002,
        },
      );
      lookYaw = nextYaw;
      lookPitch = nextPitch;
      await page.waitForTimeout(150);
    };
    await lookAtActor();
    await page.screenshot({ path: 'test-results/bp11-tactical-idle.png' });
    expect(actor().animationTime).toBeGreaterThan(0);
    expect(gripErrors(actor()).every((error) => error < 0.005)).toBe(true);
    aim = true;
    await expect.poll(() => actor().aimBlend).toBeGreaterThan(0.99);
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/remote-weapon-aim.png' });
    pitch = 0.6;
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/remote-weapon-look-up.png' });
    pitch = 0;
    aim = false;
    await expect.poll(() => actor().aimBlend).toBeLessThan(0.01);
    yaw = -Math.PI / 2;
    forward = 1;
    await expect.poll(() => actor().gaitAmount).toBeGreaterThan(0.5);
    await lookAtActor();
    await page.screenshot({ path: 'test-results/bp11-tactical-walk.png' });
    sprint = true;
    await expect.poll(() => actor().sprintBlend).toBeGreaterThan(0.7);
    await expect.poll(() => actor().carryBlend).toBeGreaterThan(0.7);
    await lookAtActor();
    const [freeHand, firingHand] = gripErrors(actor());
    expect(freeHand).toBeGreaterThan(0.15);
    expect(firingHand).toBeLessThan(0.005);
    await page.screenshot({ path: 'test-results/bp11-tactical-sprint.png' });
    fire = true;
    firePressed = true;
    await expect
      .poll(() => actor().carryBlend, { intervals: [25] })
      .toBeLessThan(0.1);
    await expect
      .poll(() => actor().fireBlend, { intervals: [25] })
      .toBeGreaterThan(0.1);
    await lookAtActor();
    expect(gripErrors(actor()).every((error) => error < 0.1)).toBe(true);
    await page.screenshot({
      path: 'test-results/remote-weapon-sprint-fire.png',
    });
    fire = false;
    jumpPressed = true;
    await expect
      .poll(() => actor().airBlend, { intervals: [25] })
      .toBeGreaterThan(0.4);
    await lookAtActor();
    await page.screenshot({ path: 'test-results/bp11-tactical-jump.png' });
    await expect
      .poll(() => actor().landingBlend, { intervals: [25] })
      .toBeGreaterThan(0.3);
    const landingX = actor().x;
    yaw = Math.PI / 2;
    await expect.poll(() => actor().x).toBeLessThan(landingX - 0.8);
    slidePressed = true;
    await expect
      .poll(() => actor().slideBlend, { intervals: [25] })
      .toBeGreaterThan(0.7);
    await lookAtActor(0.65);
    await page.screenshot({ path: 'test-results/bp11-tactical-slide.png' });
    forward = 0;
    sprint = false;
    await expect.poll(() => actor().slideBlend).toBeLessThan(0.01);
    pitch = 1.3;
    firePressed = true;
    await page.waitForTimeout(250);
    pitch = 0;
    yaw = Math.PI / 4;
    reloadPressed = true;
    await expect
      .poll(() => actor().reloadProgress, { intervals: [50] })
      .toBeGreaterThan(0.25);
    expect(actor().reloadBlend).toBeGreaterThan(0.8);
    await lookAtActor();
    await page.screenshot({ path: 'test-results/bp11-tactical-reload.png' });
    await expect.poll(() => actor().reloadBlend).toBeLessThan(0.01);
    await lookAtActor(1.16);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(400);
    // Pointer-lock clicks must not move the automation cursor and change aim.
    await page.mouse.down();
    await page.waitForTimeout(32);
    await page.mouse.up();
    await expect
      .poll(() => actor().health, { intervals: [25] })
      .toBeLessThan(100);
    await expect
      .poll(() => actor().hitBlend, { intervals: [25] })
      .toBeGreaterThan(0.1);
    await page.screenshot({ path: 'test-results/bp11-tactical-hit.png' });
    await page.mouse.up({ button: 'right' });
    expect(Number.isFinite(actor().hitYaw)).toBe(true);
    expect(peer.state.players.size).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    if (timer) clearInterval(timer);
    await page.keyboard.up('a');
    await peer?.leave();
    await filler?.leave();
  }
});
