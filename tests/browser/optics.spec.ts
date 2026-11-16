import { expect, test } from '@playwright/test';

test('lens rendering survives graphics presets, exclusive AA modes and resizing', async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  let entered = false;
  for (const mode of ['off', 'fxaa', 'smaa', 'msaa2', 'msaa4']) {
    if (entered) {
      await page.mouse.up({ button: 'right' });
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
    await page.getByRole('tab', { name: /DISPLAY/ }).click();
    await page
      .getByLabel('Sniper scope style', { exact: true })
      .selectOption('optic');
    await page.getByLabel('Adaptive resolution', { exact: true }).uncheck();
    await page
      .getByLabel('Resolution preset')
      .selectOption(mode === 'off' ? 'quality' : 'performance');
    const selector = page.getByLabel('Anti-aliasing', { exact: true });
    const supported = !(await selector
      .locator(`option[value="${mode}"]`)
      .isDisabled());
    if (supported) await selector.selectOption(mode);
    await page.getByRole('button', { name: 'Close settings' }).click();
    if (!supported) continue;
    await page.bringToFront();
    await page
      .getByRole('button', {
        name: entered ? 'RESUME TRAINING' : 'ENTER TRAINING',
      })
      .click();
    await expect(page.locator('.crosshair')).toBeVisible();
    entered = true;
    await page.keyboard.press('4');
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-weapon',
      'sniper',
    );
    await expect(page.getByTestId('weapon-status')).not.toContainText(
      'EQUIPPING',
    );
    await page.mouse.down({ button: 'right' });
    await expect(page.getByTestId('sniper-scope')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('render-resolution')).toHaveAttribute(
      'data-aa-active',
      mode,
    );
    const pixels = await page.locator('canvas').evaluate(
      (canvas: HTMLCanvasElement) =>
        new Promise<{ rgb: number[]; error: number }>((resolve) => {
          requestAnimationFrame(() => {
            const gl = canvas.getContext('webgl2')!,
              pixel = new Uint8Array(4);
            gl.readPixels(
              Math.floor(canvas.width / 2),
              Math.floor(canvas.height / 2),
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixel,
            );
            resolve({
              rgb: Array.from(pixel.slice(0, 3)),
              error: gl.getError(),
            });
          });
        }),
    );
    expect(pixels.error).toBe(0);
    expect(Math.max(...pixels.rgb)).toBeGreaterThan(25);
    if (mode === 'msaa2')
      await page.setViewportSize({ width: 1000, height: 700 });
  }
  await page.screenshot({ path: 'test-results/bp04-optic-aa.png' });
  expect(errors).toEqual([]);
});

test('scope styles change actual peripheral zoom, persist, and restore the classic default', async ({
  page,
}) => {
  test.setTimeout(150000);
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
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  const settings = async () => {
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
    await page.getByRole('tab', { name: /DISPLAY/ }).click();
  };
  const pixels = () =>
    page.locator('canvas').evaluate(
      (canvas: HTMLCanvasElement) =>
        new Promise<number[]>((resolve) =>
          requestAnimationFrame(() => {
            const gl = canvas.getContext('webgl2')!,
              values: number[] = [];
            for (const x of [0.05, 0.1, 0.15, 0.2])
              for (const y of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
                const pixel = new Uint8Array(4);
                gl.readPixels(
                  Math.floor(canvas.width * x),
                  Math.floor(canvas.height * y),
                  1,
                  1,
                  gl.RGBA,
                  gl.UNSIGNED_BYTE,
                  pixel,
                );
                values.push(...pixel.slice(0, 3));
              }
            resolve(values);
          }),
        ),
    );
  await settings();
  await expect(
    page.getByLabel('Sniper scope style', { exact: true }),
  ).toHaveValue('classic');
  const draws: number[] = [];
  let entered = false;
  for (const style of ['classic', 'optic', 'classic']) {
    if (entered) {
      await page.keyboard.press('Escape');
      await settings();
    }
    await page
      .getByLabel('Sniper scope style', { exact: true })
      .selectOption(style);
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.bringToFront();
    await page
      .getByRole('button', {
        name: entered ? 'RESUME TRAINING' : 'ENTER TRAINING',
      })
      .click();
    entered = true;
    await expect(page.locator('.crosshair')).toBeVisible();
    await page.keyboard.press('4');
    const hud = page.getByTestId('weapon-status');
    await expect(hud).toHaveAttribute('data-weapon', 'sniper');
    await expect(hud).not.toContainText('EQUIPPING');
    await expect
      .poll(async () => Number(await hud.getAttribute('data-fov')))
      .toBeGreaterThan(84);
    const before = await pixels();
    await page.mouse.down({ button: 'right' });
    await expect(page.getByTestId('sniper-scope')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('sniper-scope')).toHaveAttribute(
      'data-style',
      style,
    );
    await expect
      .poll(async () => Number(await hud.getAttribute('data-fov')))
      .toBeLessThan(26);
    const during = await pixels();
    if (style === 'optic') expect(during).toEqual(before);
    else expect(during).not.toEqual(before);
    draws.push(
      Number(
        await page
          .getByTestId('render-resolution')
          .getAttribute('data-world-draws'),
      ),
    );
    await page.screenshot({
      path: `test-results/bp04-scope-style-${style}.png`,
    });
    await page.mouse.up({ button: 'right' });
    await expect(page.getByTestId('sniper-scope')).toHaveCSS('opacity', '0');
    await expect
      .poll(async () => Number(await hud.getAttribute('data-fov')))
      .toBeGreaterThan(84);
  }
  expect(draws[1]!).toBeGreaterThan(draws[0]!);
  expect(draws[2]).toBe(draws[0]);
  await page.keyboard.press('Escape');
  await settings();
  await page
    .getByLabel('Sniper scope style', { exact: true })
    .selectOption('optic');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await settings();
  await expect(
    page.getByLabel('Sniper scope style', { exact: true }),
  ).toHaveValue('optic');
  await page.getByRole('button', { name: 'RESTORE DEFAULTS' }).click();
  await expect(
    page.getByLabel('Sniper scope style', { exact: true }),
  ).toHaveValue('classic');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await settings();
  await expect(
    page.getByLabel('Sniper scope style', { exact: true }),
  ).toHaveValue('classic');
  expect(errors).toEqual([]);
});
