import { expect, test } from '@playwright/test';

test('desktop minimap follows movement and heading at the saved display opacity', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({ preset: 'performance', adaptive: false }),
    );
  });
  await page.goto('/');
  await expect(page.getByTestId('minimap')).toHaveCount(0);
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  await page.getByLabel('Minimap opacity').fill('70');
  await page.reload();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  const map = page.getByRole('img', { name: 'The Depot minimap' });
  await expect(map).toHaveCSS('opacity', '0.7');
  await expect
    .poll(() =>
      map.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(192);
  const marker = page.getByTestId('minimap-player');
  const vertical = () =>
    marker.evaluate((element) => parseFloat(element.style.top));
  await expect.poll(vertical).toBeGreaterThan(65);
  const spawn = await vertical();
  await page.keyboard.down('w');
  await expect.poll(vertical).toBeLessThan(spawn - 3);
  await page.keyboard.up('w');
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent('mousemove', { movementX: Math.PI / 2 / 0.002 }),
    ),
  );
  await expect
    .poll(() =>
      marker.evaluate(
        (element) => new DOMMatrix(getComputedStyle(element).transform).b,
      ),
    )
    .toBeCloseTo(1, 1);
  const fps = (await page
    .getByRole('complementary', { name: 'Live performance metrics' })
    .boundingBox())!;
  expect((await map.boundingBox())!.y).toBeGreaterThan(fps.y + fps.height);
  await page.screenshot({ path: 'test-results/gameplay-minimap-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(map).toHaveCount(0);
});
