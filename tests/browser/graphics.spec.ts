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
    ['performance', 426, 240],
    ['balanced', 640, 360],
    ['quality', 854, 480],
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
  await page.reload();
  await expect(page.getByLabel('Resolution preset')).toHaveValue('quality');
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

test('balanced upscale produces exact 2×2 pixel blocks with only one presentation draw', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await configure(page, 'balanced');
  await expect(page.getByTestId('render-resolution')).toHaveAttribute(
    'data-width',
    '640',
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
  expect(pixels.mismatches).toBe(0);
  expect(pixels.antialias).toBe(false);
  expect(pixels.smoothing).toBe('pixelated');
  // Background #48524b must survive the linear target and a single sRGB output conversion.
  [72, 82, 75].forEach((channel, index) =>
    expect(Math.abs(pixels.sky[index]! - channel)).toBeLessThanOrEqual(2),
  );
  const calls = Number(
    await page
      .getByTestId('render-resolution')
      .getAttribute('data-world-draws'),
  );
  expect(calls).toBeLessThanOrEqual(8);
  expect(
    Number(
      await page.getByTestId('render-resolution').getAttribute('data-draws'),
    ),
  ).toBe(calls + 1);
  await page.screenshot({ path: 'test-results/depot-pixel-balanced.png' });
});
