import { expect, test, type Page } from '@playwright/test';

async function configure(page: Page, preset: string) {
  const adaptive = page.getByRole('checkbox', { name: 'Adaptive resolution' });
  await adaptive.uncheck();
  await page.getByLabel('Resolution preset').selectOption(preset);
  await expect(page.getByTestId('render-resolution')).toHaveAttribute(
    'data-preset',
    preset,
  );
}

test('presets retain a native HUD, persist settings and resize without stretching', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  const readout = page.getByTestId('render-resolution');
  for (const [preset, width, height] of [
    ['performance', 960, 540],
    ['balanced', 1280, 720],
    ['quality', 1280, 720],
    ['hd', 1280, 720],
    ['ultra', 1280, 720],
  ] as const) {
    await configure(page, preset);
    await expect(readout).toHaveAttribute('data-width', String(width));
    await expect(readout).toHaveAttribute('data-height', String(height));
    expect(
      await page
        .locator('canvas')
        .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
    ).toEqual([1280, 720]);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await configure(page, 'hd');
  await expect(readout).toHaveAttribute('data-width', '1920');
  await expect(readout).toHaveAttribute('data-height', '1080');
  expect(
    await page
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
  ).toEqual([1920, 1080]);
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page
    .locator('canvas')
    .screenshot({ path: 'test-results/breakpoint-hd-depot.png' });
  await page.reload();
  await expect(page.getByLabel('Resolution preset')).toHaveValue('hd');
  await expect(
    page.getByRole('checkbox', { name: 'Adaptive resolution' }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 960, height: 640 });
  await expect(readout).toHaveAttribute('data-output-width', '960');
  const dimensions = await readout.evaluate((element) => ({
    width: Number(element.dataset.width),
    height: Number(element.dataset.height),
  }));
  expect(Math.abs(dimensions.width / dimensions.height - 1.5)).toBeLessThan(
    0.01,
  );
  expect(errors).toEqual([]);
});

test('low resolution uses smooth presentation with textured output and one presentation draw', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await configure(page, 'performance');
  await expect(page.getByTestId('render-resolution')).toHaveAttribute(
    'data-width',
    '960',
  );
  const pixels = await page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement) =>
      new Promise<{
        mismatches: number;
        colors: number;
        antialias: boolean;
        smoothing: string;
        sky: number[];
      }>((resolve) => {
        requestAnimationFrame(() => {
          const gl = canvas.getContext('webgl2')!;
          const buffer = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            buffer,
          );
          let mismatches = 0;
          const colors = new Set<number>();
          for (let y = 40; y < canvas.height - 40; y += 2) {
            for (let x = 40; x < canvas.width - 40; x += 2) {
              const offset = (y * canvas.width + x) * 4;
              colors.add(
                (buffer[offset]! << 16) |
                  (buffer[offset + 1]! << 8) |
                  buffer[offset + 2]!,
              );
              for (const neighbour of [
                offset + 4,
                offset + canvas.width * 4,
                offset + canvas.width * 4 + 4,
              ]) {
                if (
                  buffer[offset] !== buffer[neighbour] ||
                  buffer[offset + 1] !== buffer[neighbour + 1] ||
                  buffer[offset + 2] !== buffer[neighbour + 2]
                )
                  mismatches++;
              }
            }
          }
          resolve({
            mismatches,
            colors: colors.size,
            antialias: Boolean(gl.getContextAttributes()!.antialias),
            smoothing: getComputedStyle(canvas).imageRendering,
            sky: Array.from(
              buffer.slice(
                ((canvas.height - 10) * canvas.width + canvas.width / 2) * 4,
                ((canvas.height - 10) * canvas.width + canvas.width / 2) * 4 +
                  3,
              ),
            ),
          });
        });
      }),
  );
  expect(pixels.colors).toBeGreaterThan(16);
  expect(pixels.mismatches).toBeGreaterThan(100);
  expect(pixels.antialias).toBe(false);
  expect(pixels.smoothing).toBe('auto');
  expect(pixels.sky[2]).toBeGreaterThan(pixels.sky[0]!);
  const calls = Number(
    await page
      .getByTestId('render-resolution')
      .getAttribute('data-world-draws'),
  );
  expect(calls).toBeLessThanOrEqual(14);
  expect(
    Number(
      await page.getByTestId('render-resolution').getAttribute('data-draws'),
    ),
  ).toBe(calls + 1);
  await page.screenshot({ path: 'test-results/bp01-performance-menu.png' });
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.screenshot({ path: 'test-results/bp01-performance-playing.png' });
});

test('texture, shadows, view distance and render scale are applied and persist', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  await configure(page, 'quality');
  const metrics = page.getByTestId('render-resolution');
  await page.getByLabel('Texture detail', { exact: true }).selectOption('low');
  await expect(metrics).toHaveAttribute('data-texture-tile-size', '128');
  await page.getByLabel('Shadow quality', { exact: true }).selectOption('low');
  await expect(metrics).toHaveAttribute('data-shadow-map-size', '1024');
  await page.getByLabel('Shadow quality', { exact: true }).selectOption('high');
  await expect(metrics).toHaveAttribute('data-shadow-map-size', '2048');
  await page.getByLabel('View distance', { exact: true }).selectOption('40');
  await expect(metrics).toHaveAttribute('data-view-distance', '40');
  await expect(metrics).toHaveAttribute('data-camera-far', '40');
  await page.getByLabel('Render scale', { exact: true }).selectOption('0.5');
  await expect(metrics).toHaveAttribute('data-width', '800');
  await page.screenshot({
    path: 'test-results/bp01-graphics-settings.png',
    animations: 'disabled',
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await expect(metrics).toHaveAttribute('data-texture-tile-size', '128');
  await expect(metrics).toHaveAttribute('data-shadow-map-size', '2048');
  await expect(metrics).toHaveAttribute('data-view-distance', '40');
  await expect(metrics).toHaveAttribute('data-width', '800');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  await page.getByLabel('Render scale', { exact: true }).selectOption('1');
  await page.getByLabel('Shadow quality', { exact: true }).selectOption('off');
  await page.getByLabel('Texture detail', { exact: true }).selectOption('high');
  await page.getByLabel('View distance', { exact: true }).selectOption('80');
  await expect(metrics).toHaveAttribute('data-shadow-map-size', '0');
  await expect(metrics).toHaveAttribute('data-texture-tile-size', '256');
  await expect(metrics).toHaveAttribute('data-width', '1280');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.screenshot({ path: 'test-results/bp01-quality-playing.png' });
  expect(errors).toEqual([]);
});
