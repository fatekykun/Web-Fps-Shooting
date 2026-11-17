import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

async function sensitivity(page: Page) {
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /SENSITIVITY/ }).click();
}
const labels = [
  'Camera Steering Sensitivity',
  'Camera ADS Sensitivity',
  'Camera Sniper Scope Sensitivity',
  'Camera Vertical Turning Sensitivity',
  'Firing Steering Sensitivity',
  'Firing ADS Sensitivity',
  'Firing Sniper Scope Sensitivity',
  'Firing Vertical Turning Sensitivity',
];
test('eight independent sliders migrate legacy preferences, persist, and reset without changing other settings', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('breakpoint.settings.v1'))
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ sensitivity: 1.75, fov: 103, autoReload: false }),
      );
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'off',
      }),
    );
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await sensitivity(page);
  await expect(page.getByRole('slider')).toHaveCount(8);
  for (const label of labels)
    await expect(
      page.getByRole('slider', { name: new RegExp(label) }),
    ).toHaveValue('175');
  for (let i = 0; i < labels.length; i++) {
    const slider = page.getByRole('slider', { name: new RegExp(labels[i]!) });
    await slider.focus();
    await page.keyboard.press('End');
    for (let j = 0; j <= i; j++) await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue(String(299 - i));
  }
  await page.screenshot({ path: 'test-results/bp07-sensitivity.png' });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await sensitivity(page);
  for (let i = 0; i < labels.length; i++)
    await expect(
      page.getByRole('slider', { name: new RegExp(labels[i]!) }),
    ).toHaveValue(String(299 - i));
  await page
    .getByRole('button', { name: 'RESET SENSITIVITY', exact: true })
    .click();
  for (const label of labels)
    await expect(
      page.getByRole('slider', { name: new RegExp(label) }),
    ).toHaveValue('100');
  await page.getByRole('tab', { name: /CONTROLS/ }).click();
  await expect(page.getByRole('slider', { name: /Field of view/ })).toHaveValue(
    '103',
  );
  await expect(
    page.getByLabel('Auto Reload', { exact: true }),
  ).not.toBeChecked();
  await page.getByRole('tab', { name: /SENSITIVITY/ }).click();
  await page.getByRole('slider', { name: /Firing ADS Sensitivity/ }).focus();
  await page.keyboard.press('Home');
  await page.getByRole('button', { name: 'RESTORE DEFAULTS' }).click();
  for (const label of labels)
    await expect(
      page.getByRole('slider', { name: new RegExp(label) }),
    ).toHaveValue('100');
  await page.setViewportSize({ width: 640, height: 640 });
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/bp07-sensitivity-640.png' });
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pointer-locked look sends independent hip, ADS and sniper camera/firing deltas to the real server', async ({
  page,
}) => {
  test.setTimeout(150000);
  let peer: Room<unknown, RoomState> | undefined;
  const camera = { steering: 50, ads: 120, sniper: 220, vertical: 80 },
    firing = { steering: 170, ads: 60, sniper: 140, vertical: 30 };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ camera, firing }) => {
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ sensitivity: { camera, firing } }),
      );
      localStorage.setItem(
        'breakpoint.graphics.v2',
        JSON.stringify({
          preset: 'performance',
          adaptive: false,
          antiAliasing: 'off',
        }),
      );
    },
    { camera, firing },
  );
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('LookCheck');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    peer = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
      code!,
      { name: 'Observer' },
    );
    for (const type of ['shot', 'kill', 'correction', 'notice'])
      peer.onMessage(type, () => {});
    peer.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await page.getByRole('button', { name: 'BACK TO ARENA' }).click();
    await page.getByRole('button', { name: 'ENTER ROOM' }).click();
    await expect(page.locator('.crosshair')).toBeVisible();
    const host = () =>
      [...peer!.state.players.values()].find(
        (player) => player.name === 'LookCheck',
      )!;
    await expect.poll(() => !!host()).toBe(true);
    const hud = page.getByTestId('weapon-status');
    for (const [key, id] of [
      ['1', 'rifle'],
      ['4', 'sniper'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(hud).toHaveAttribute('data-weapon', id);
      await page.waitForTimeout(350);
      for (const aimed of [false, true]) {
        if (aimed) await page.mouse.down({ button: 'right' });
        // Let the existing ADS blend and zoom settle; sensitivity adds no smoothing.
        await page.waitForTimeout(1600);
        const fov = Number(await hud.getAttribute('data-fov'));
        const zoom =
          Math.tan((fov * Math.PI) / 360) / Math.tan((85 * Math.PI) / 360);
        for (const shooting of [false, true, false]) {
          if (shooting) await page.mouse.down();
          else await page.mouse.up();
          await page.waitForTimeout(100);
          const before = { yaw: host().yaw, pitch: host().pitch };
          // Buttons and sensitivity changes must not themselves rotate input.
          await page.waitForTimeout(100);
          expect(host().yaw).toBeCloseTo(before.yaw, 4);
          expect(host().pitch).toBeCloseTo(before.pitch, 4);
          await page.evaluate(() =>
            document.dispatchEvent(
              new MouseEvent('mousemove', { movementX: 20, movementY: 12 }),
            ),
          );
          const group = shooting ? firing : camera;
          const horizontal = aimed
            ? id === 'sniper'
              ? group.sniper
              : group.ads
            : group.steering;
          const yaw = before.yaw - (20 * 0.002 * zoom * horizontal) / 100;
          const pitch =
            before.pitch - (12 * 0.002 * zoom * group.vertical) / 100;
          await expect.poll(() => host().yaw).toBeCloseTo(yaw, 3);
          await expect.poll(() => host().pitch).toBeCloseTo(pitch, 3);
        }
      }
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'test-results/bp07-server-look.png' });
    expect(errors).toEqual([]);
  } finally {
    await peer?.leave();
  }
});
