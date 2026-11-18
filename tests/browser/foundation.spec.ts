import { expect, test, type Page } from '@playwright/test';
import { movementConfig } from '@breakpoint/shared';
import { arenaBoxes } from '@breakpoint/shared/maps';

async function position(page: Page) {
  return page.getByTestId('position').evaluate((readout) => ({
    x: Number(readout.dataset.x),
    y: Number(readout.dataset.y),
    z: Number(readout.dataset.z),
  }));
}

test('boots, captures mouse, walks, collides, pauses and resumes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const enter = page.getByRole('button', { name: 'ENTER TRAINING' });
  await expect(enter).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect
    .poll(async () => Number(await page.getByTestId('fps').textContent()))
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/depot-entry.png' });
  await enter.click();
  await expect(page.locator('.crosshair')).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement?.tagName)).toBe(
    'CANVAS',
  );
  await page.keyboard.down('w');
  await expect.poll(async () => (await position(page)).z).toBeLessThan(9);
  await page.screenshot({ path: 'test-results/depot-playing.png' });
  const cover = arenaBoxes.find(
    (box) => box.kind === 'crate' && box.position[0] === 0,
  )!;
  const stopZ =
    cover.position[2] +
    cover.size[2] / 2 +
    movementConfig.capsuleRadius +
    movementConfig.collisionOffset;
  await expect
    .poll(async () => (await position(page)).z, { timeout: 30000 })
    .toBeLessThan(stopZ + 0.1);
  await page.waitForTimeout(500);
  const blocked = await position(page);
  expect(blocked.z).toBeCloseTo(stopZ, 2);
  expect(blocked.y).toBeGreaterThan(0.87);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'RESUME TRAINING' }),
  ).toBeVisible();
  const paused = await position(page);
  await page.keyboard.down('s');
  await page.waitForTimeout(400);
  await page.keyboard.up('s');
  expect((await position(page)).z).toBeCloseTo(paused.z, 2);
  await page.getByRole('button', { name: 'RESUME TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.keyboard.down('s');
  await expect
    .poll(async () => (await position(page)).z)
    .toBeGreaterThan(paused.z + 1);
  await page.keyboard.up('s');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 960, height: 640 });
  await expect
    .poll(async () =>
      page
        .locator('canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBe(960);
  expect(errors).toEqual([]);
});
