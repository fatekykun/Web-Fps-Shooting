import { test, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

test('inspects actual models, saves four independent slots and restores the default', async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) requests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const open = page.getByRole('button', { name: 'LOADOUTS', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Loadouts' });
  const weapon = dialog.getByLabel('Change Weapon');
  const skin = dialog.getByLabel('Change Skin');
  const character = dialog.getByLabel('Character', { exact: true });
  const melee = dialog.getByLabel('Melee Weapon');
  const preview = dialog.getByTestId('weapon-showcase');
  const canvas = preview.getByTestId('weapon-showcase-canvas');
  const slot = (number: number) =>
    dialog.getByRole('button', { name: new RegExp(`^Loadout ${number}\\b`) });
  const previews = [
    { weapon: 'rifle', skin: 'memento-mori' },
    { weapon: 'smg', skin: 'neon-blade' },
    { weapon: 'shotgun', skin: 'glorious-blaze' },
    { weapon: 'sniper', skin: 'lotus-lava' },
  ];
  for (const [index, entry] of previews.entries()) {
    await slot(index + 1).click();
    await expect(weapon).toHaveValue(entry.weapon);
    await expect(skin).toHaveValue('standard');
    await expect(character).toHaveValue('standard');
    await expect(melee).toHaveValue('glacier-fang');
    await skin.selectOption(entry.skin);
    await expect(preview).toHaveAttribute('data-status', 'ready');
    const initial = await canvas.screenshot();
    const bounds = (await canvas.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 85, y + 15, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => (await canvas.screenshot()).equals(initial))
      .toBe(false);
    const rotated = await canvas.screenshot();
    await page.mouse.wheel(0, -100);
    await expect
      .poll(async () => (await canvas.screenshot()).equals(rotated))
      .toBe(false);
    await preview.getByRole('button', { name: 'Reset View' }).click();
  }
  await preview.getByRole('button', { name: 'Full Screen Inspect' }).click();
  await expect(dialog).toHaveClass(/inspecting/);
  await preview.getByRole('button', { name: 'Exit Full Screen' }).click();
  const saved = [
    { weapon: 'rifle', skin: 'cinder-wyrm' },
    { weapon: 'rifle', skin: 'memento-mori' },
    { weapon: 'smg', skin: 'standard' },
    { weapon: 'shotgun', skin: 'glorious-blaze' },
  ];
  for (const [index, entry] of saved.entries()) {
    await slot(index + 1).click();
    await weapon.selectOption(entry.weapon);
    await skin.selectOption(entry.skin);
    await dialog.getByRole('button', { name: 'Save Loadout' }).click();
    await expect(dialog.getByText(`Loadout ${index + 1} saved`)).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Set as Default' }).click();
  const previewContext = await canvas.evaluateHandle(
    (element: HTMLCanvasElement) => element.getContext('webgl2'),
  );
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(canvas).toHaveCount(0);
  await expect
    .poll(() => previewContext.evaluate((context) => context?.isContextLost()))
    .toBe(true);
  await previewContext.dispose();
  await open.click();
  await slot(1).click();
  await slot(2).click();
  await expect(preview).toHaveAttribute('data-status', 'ready');
  expect(
    requests.filter((request) => request.endsWith('/lotus_inferno_v2.glb')),
  ).toHaveLength(1);
  await page.reload();
  await open.click();
  await expect(slot(4)).toHaveAttribute('aria-pressed', 'true');
  for (const [index, entry] of saved.entries()) {
    await slot(index + 1).click();
    await expect(weapon).toHaveValue(entry.weapon);
    await expect(skin).toHaveValue(entry.skin);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    dialog.getByRole('button', { name: 'Save Loadout' }),
  ).toBeInViewport();
  expect(errors).toEqual([]);
});

test('spawns with the saved default when the match countdown expires', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'LOADOUTS', exact: true }).click();
  await page.getByRole('button', { name: /^Loadout 3/ }).click();
  await page.getByLabel('Change Skin').selectOption('glorious-blaze');
  await page.getByRole('button', { name: 'Save Loadout' }).click();
  await page.getByRole('button', { name: 'Set as Default' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Default host');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    (await page.getByTestId('room-code').textContent())!,
    { name: 'Default guest' },
  );
  for (const type of ['shot', 'kill', 'notice', 'correction'])
    guest.onMessage(type, () => {});
  try {
    guest.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await expect(
      page.getByRole('button', { name: 'Equip Loadout 3' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('match-countdown')).toHaveCount(0);
    await expect
      .poll(() => guest.state.players.get(guest.state.hostId)?.skin)
      .toBe('glorious-blaze');
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'shotgun',
    );
    expect(guest.state.players.get(guest.sessionId)!).toMatchObject({
      weapon: 'rifle',
      skin: 'standard',
      operator: 'standard',
    });
  } finally {
    await guest.leave();
  }
});

test.describe('touch preview', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 844, height: 390 },
  });

  test('pinches to zoom in landscape and resets the view', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: 'LOADOUTS', exact: true }).tap();
    const preview = page.getByTestId('weapon-showcase');
    await expect(preview).toHaveAttribute('data-status', 'ready');
    const canvas = preview.getByTestId('weapon-showcase-canvas');
    const initial = await canvas.screenshot();
    const bounds = (await canvas.boundingBox())!;
    const browser = await context.newCDPSession(page);
    const point = (id: number, dx: number) => ({
      id,
      x: bounds.x + bounds.width / 2 + dx,
      y: bounds.y + bounds.height * 0.35,
    });
    await browser.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point(1, -30), point(2, 30)],
    });
    await browser.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(1, -60), point(2, 60)],
    });
    await browser.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(async () => (await canvas.screenshot()).equals(initial))
      .toBe(false);
    await preview.getByRole('button', { name: 'Reset View' }).tap();
    await expect
      .poll(async () => (await canvas.screenshot()).equals(initial))
      .toBe(true);
  });
});
