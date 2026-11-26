import { expect, test, type Page } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { ServerShot } from '@breakpoint/shared/combat';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

test.use({ deviceScaleFactor: 2 });

async function enter(page: Page, path = '/') {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({ preset: 'performance', adaptive: false }),
    );
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({ crosshair: { dynamic: false } }),
    );
  });
  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.goto(path);
  await page.bringToFront();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair[data-shape="cross"]')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-15T01:00:00Z'));
  await page.clock.runFor(250);
}

async function equipShotgun(page: Page) {
  await page.keyboard.press('3');
  await page.clock.runFor(350);
  const reticle = page.locator('.crosshair[data-shape="shotgun"]');
  await expect(reticle).toBeVisible();
  await expect(reticle.locator('i:visible')).toHaveCount(0);
  return reticle;
}

test('projects the shotgun cone at high DPI, through movement, ADS and resize', async ({
  page,
}) => {
  await enter(page);
  const ring = await equipShotgun(page);
  const measure = () =>
    ring.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      const viewport = document
        .querySelector('.viewport')!
        .getBoundingClientRect();
      const style = getComputedStyle(node, '::before');
      return {
        radius: parseFloat(style.width) / 2,
        height: viewport.height,
        x: bounds.x + bounds.width / 2 - viewport.x - viewport.width / 2,
        y: bounds.y + bounds.height / 2 - viewport.y - viewport.height / 2,
      };
    });
  const pixels = (angle: number, fov: number, height: number) =>
    ((height / 2) * Math.tan((angle * Math.PI) / 180)) /
    Math.tan((fov * Math.PI) / 360);
  const idle = await measure();
  expect(idle.radius).toBeCloseTo(pixels(4.5, 85, idle.height), 1);
  expect(idle.x).toBeCloseTo(0, 1);
  expect(idle.y).toBeCloseTo(0, 1);

  await page.setViewportSize({ width: 960, height: 620 });
  await page.clock.runFor(350);
  const resized = await measure();
  expect(resized.radius).toBeCloseTo(pixels(4.5, 85, resized.height), 1);
  expect(resized.radius).toBeLessThan(idle.radius);

  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(900);
  expect((await measure()).radius).toBeCloseTo(
    pixels(2, 60, resized.height),
    1,
  );
  await page.mouse.up({ button: 'right' });
  await page.clock.runFor(850);

  await page.keyboard.down('w');
  await page.clock.runFor(320);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'walking',
  );
  const walking = (await measure()).radius;
  expect(walking).toBeGreaterThan(resized.radius);
  await page.keyboard.press('c');
  await page.clock.runFor(360);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'crouching',
  );
  const crouched = (await measure()).radius;
  expect(crouched).toBeLessThan(walking);
  expect(crouched).toBeGreaterThan(resized.radius); // Only the lower movement speed changes accuracy.
  await page.keyboard.press('c');
  await page.keyboard.down('Shift');
  await page.clock.runFor(320);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sprinting',
  );
  const sprint = (await measure()).radius;
  expect(sprint).toBeGreaterThan(walking);
  await page.keyboard.press('c');
  await page.clock.runFor(256);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sliding',
  );
  const sliding = (await measure()).radius;
  expect(sliding).toBeGreaterThan(resized.radius);
  await page.keyboard.press('Space');
  await page.clock.runFor(256);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'airborne',
  );
  expect((await measure()).radius).toBeGreaterThan(sliding);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');

  for (const weapon of ['1', '2', '4']) {
    await page.keyboard.press(weapon);
    await page.clock.runFor(230);
    await expect(
      page.locator('.crosshair[data-shape="cross"] i:visible'),
    ).toHaveCount(4);
  }
});

test('shows the local shotgun ring in a private room while the server resolves 15 pellets', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({ preset: 'performance', adaptive: false }),
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Pellet check');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const code = (await page.getByTestId('room-code').textContent())!;
  const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    code,
    { name: 'Observer' },
  );
  const shots: ServerShot[] = [];
  guest.onMessage('shot', (shot: ServerShot) => shots.push(shot));
  for (const message of ['correction', 'notice', 'kill'])
    guest.onMessage(message, () => {});
  try {
    guest.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await page.getByRole('button', { name: 'Equip Loadout 3' }).click();
    await enterStartedMatch(page);
    await expect(
      page.locator('.crosshair[data-shape="shotgun"]'),
    ).toBeVisible();
    const weapon = page.getByTestId('weapon-status');
    await expect(weapon).toHaveAttribute('data-weapon', 'shotgun');
    await expect(weapon.locator('.weapon-action')).toHaveText('HIP FIRE');
    await page.mouse.down();
    await expect.poll(() => shots[0]?.traces.length).toBe(15);
    await page.mouse.up();
    expect(shots[0]?.weapon).toBe('shotgun');
    await expect(weapon).toHaveAttribute('data-ammo', '7');
  } finally {
    await guest.leave();
  }
});

for (const distance of [3, 5, 10, 15]) {
  test(`development range plots real pellet hits on the ${distance} m wall`, async ({
    page,
  }) => {
    test.skip(
      process.env.BP_SHOTGUN_DEBUG !== '1',
      'Requires a Vite dev server',
    );
    await enter(page, `/?shotgun-debug=${distance}`);
    await equipShotgun(page);
    const range = page.getByTestId('shotgun-range');
    await expect(range).toContainText(
      `SHOTGUN RANGE · ${distance} m FROM SPAWN`,
    );
    await expect(range).toContainText('4.50° HALF-ANGLE');
    for (let volley = 1; volley <= 3; volley++) {
      await page.mouse.down();
      await page.clock.runFor(40);
      await page.mouse.up();
      await expect(range).toHaveAttribute('data-shot', String(volley));
      await expect(range).toHaveAttribute('data-impacts', '15');
      await expect(range).toHaveAttribute('data-outside', '0');
      await expect(range).toHaveAttribute(
        'data-markers',
        String(Math.min(volley * 15, 32)),
      );
      await expect(range).toContainText(`${distance.toFixed(2)} m TO WALL`);
      await page.clock.runFor(1200);
    }
  });
}
