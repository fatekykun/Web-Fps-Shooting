import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  // Freeze simulation between trusted key events, then run every animation frame explicitly.
  // Otherwise remote protocol latency can outlast a 650 ms action being inspected.
  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'ENTER TRAINING' });
  await expect(button).toBeEnabled();
  // Acquire pointer lock with a focused page and a normal trusted click before
  // freezing time; Chromium can deny capture during paused-clock startup.
  await page.bringToFront();
  await button.click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-15T01:00:00Z'));
  await page.clock.runFor(300);
  await expect(
    page.getByRole('complementary', { name: 'Live performance metrics' }),
  ).not.toContainText('NaN');
}

async function sprint(page: Page) {
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.clock.runFor(1200);
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    7.5,
  );
}

test('C crouches while walking and Z toggles prone with a lower collision capsule', async ({
  page,
}) => {
  await enter(page);
  const pose = page.getByTestId('position');
  await page.keyboard.down('w');
  await page.clock.runFor(320);
  await page.keyboard.press('c');
  await page.clock.runFor(320);
  await expect(pose).toHaveAttribute('data-state', 'crouching');
  expect(Number(await pose.getAttribute('data-half-height'))).toBeCloseTo(0.35);
  await page.keyboard.press('z');
  // Allow the resize to settle before the next 4 Hz telemetry sample.
  await page.clock.runFor(480);
  await expect(pose).toHaveAttribute('data-state', 'prone');
  expect(Number(await pose.getAttribute('data-half-height'))).toBeCloseTo(0.04);
  await page.keyboard.press('z');
  await page.clock.runFor(320);
  await expect(pose).toHaveAttribute('data-state', 'walking');
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
});

for (const [direction, yaw, completed] of [
  ['backward', Math.PI, false],
  ['left', Math.PI / 2, false],
  ['right', -Math.PI / 2, false],
  ['backward after completion', Math.PI, true],
] as const) {
  test(`slide-jump redirects ${direction} through camera input`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await enter(page);
    await sprint(page);
    await page.keyboard.press('c');
    await page.clock.runFor(256);
    // Feed the same mouse movement event used by the existing look-input checks.
    await page.evaluate((angle) => {
      document.dispatchEvent(
        new MouseEvent('mousemove', { movementX: -angle / 0.002 }),
      );
    }, yaw);
    if (completed) await page.clock.runFor(416); // 672 ms: slide ended, grace still active.
    const position = () =>
      page.getByTestId('position').evaluate((element) => ({
        x: Number(element.dataset.x),
        y: Number(element.dataset.y),
        z: Number(element.dataset.z),
      }));
    await page.keyboard.press('Space');
    // Telemetry publishes at 4 Hz. Compare two airborne samples, not an old
    // pre-jump slide position that can include 200 ms of movement in the old direction.
    await page.clock.runFor(256);
    await expect(page.getByTestId('position')).toHaveAttribute(
      'data-state',
      'airborne',
    );
    const before = await position();
    await page.clock.runFor(256);
    const after = await position();
    await expect(page.getByTestId('position')).toHaveAttribute(
      'data-state',
      'airborne',
    );
    expect(after.y).toBeGreaterThan(1.1);
    const facingProgress =
      -(after.x - before.x) * Math.sin(yaw) -
      (after.z - before.z) * Math.cos(yaw);
    expect(facingProgress).toBeGreaterThan(1);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}

test('ground reversals, sprint release and idle braking respond through real keyboard input', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await sprint(page);
  await page.keyboard.up('w');
  await page.keyboard.down('s');
  await page.clock.runFor(400);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'walking',
  );
  const reversed = Number(
    await page.getByTestId('position').getAttribute('data-z'),
  );
  await page.clock.runFor(300);
  expect(
    Number(await page.getByTestId('position').getAttribute('data-z')),
  ).toBeGreaterThan(reversed + 1);
  await page.keyboard.up('s');
  await page.clock.runFor(300);
  expect(Number(await page.getByTestId('speed').textContent())).toBeLessThan(
    0.01,
  );
  await page.keyboard.down('d');
  await page.clock.runFor(600);
  await page.keyboard.up('d');
  await page.keyboard.down('a');
  await page.clock.runFor(300);
  const leftward = Number(
    await page.getByTestId('position').getAttribute('data-x'),
  );
  await page.clock.runFor(300);
  expect(
    Number(await page.getByTestId('position').getAttribute('data-x')),
  ).toBeLessThan(leftward - 1);
  await page.keyboard.up('a');
  await page.keyboard.down('d');
  await page.clock.runFor(300);
  const rightward = Number(
    await page.getByTestId('position').getAttribute('data-x'),
  );
  await page.clock.runFor(300);
  expect(
    Number(await page.getByTestId('position').getAttribute('data-x')),
  ).toBeGreaterThan(rightward + 1);
  await page.keyboard.up('d');
  await page.keyboard.down('w');
  await page.clock.runFor(700);
  await page.keyboard.up('w'); // Shift is still held: releasing W must stop sprinting.
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'walking',
  );
  expect(Number(await page.getByTestId('speed').textContent())).toBeLessThan(
    0.01,
  );
  const stoppedZ = Number(
    await page.getByTestId('position').getAttribute('data-z'),
  );
  await page.clock.runFor(600);
  expect(
    Number(await page.getByTestId('position').getAttribute('data-z')),
  ).toBeCloseTo(stoppedZ, 3);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('sprint, tap slide and jump cancel retain momentum through real input', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await sprint(page);
  await page.keyboard.press('c');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sliding',
  );
  await page.keyboard.down('Space');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'airborne',
  );
  expect(
    Number(await page.getByTestId('position').getAttribute('data-y')),
  ).toBeGreaterThan(1.1);
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    6,
  );
  await page.keyboard.up('Space');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'RESUME TRAINING' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('sprint slide widens the camera and cancels on Depot cover', async ({
  page,
}) => {
  await enter(page);
  const pose = page.getByTestId('position');
  const readFov = async () =>
    Number(await page.getByTestId('weapon-status').getAttribute('data-fov'));
  const baseFov = await readFov();
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.clock.runFor(2400);
  await page.keyboard.press('c');
  await page.clock.runFor(256);
  await expect(pose).toHaveAttribute('data-state', 'sliding');
  expect(await readFov()).toBeGreaterThan(baseFov + 2.5);
  await page.clock.runFor(448);
  await expect(pose).toHaveAttribute('data-state', /^(recovering|sprinting)$/);
  expect(Number(await page.getByTestId('speed').textContent())).toBeLessThan(
    0.15,
  );
  expect(Number(await pose.getAttribute('data-z'))).toBeCloseTo(-10.965, 1);
  await page.clock.runFor(288);
  await expect(pose).toHaveAttribute('data-state', 'sprinting');
  expect(Number(await pose.getAttribute('data-half-height'))).toBeCloseTo(
    0.55,
    2,
  );
  expect(await readFov()).toBeCloseTo(baseFov, 1);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
});

test('backslide and dolphin dive recover to a standing sprint', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await sprint(page);
  await page.keyboard.up('w');
  await page.keyboard.down('s');
  await page.keyboard.press('c');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'backsliding',
  );
  expect(
    Number(await page.getByTestId('position').getAttribute('data-half-height')),
  ).toBeLessThanOrEqual(0.31);
  await page.keyboard.up('s');
  await page.keyboard.down('w');
  await page.clock.runFor(1500);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sprinting',
  );
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    7.5,
  );
  await page.keyboard.press('x');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'diving',
  );
  await page.screenshot({ path: 'test-results/depot-dive.png' });
  await page.clock.runFor(1200);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sprinting',
  );
  expect(
    Number(await page.getByTestId('position').getAttribute('data-half-height')),
  ).toBeCloseTo(0.55);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
