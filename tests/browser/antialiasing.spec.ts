import { expect, test, type Page } from '@playwright/test';
import type { AntiAliasingMode } from '../../apps/client/src/game/rendering/antiAliasing';

// Read only the static roof/sky silhouette, avoiding animated objects and DOM overlays.
async function roofPixels(page: Page) {
  const encoded = await page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement) =>
      new Promise<string>((resolve) => {
        requestAnimationFrame(() => {
          const gl = canvas.getContext('webgl2')!;
          const bytes = new Uint8Array(1280 * 140 * 4);
          gl.readPixels(
            0,
            canvas.height - 330,
            1280,
            140,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bytes,
          );
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          resolve(btoa(binary));
        });
      }),
  );
  return Buffer.from(encoded, 'base64');
}

test('exclusive AA modes smooth geometry before presentation and survive resize/reload', async ({
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
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  await page.getByLabel('Adaptive resolution', { exact: true }).uncheck();
  await page.getByLabel('Resolution preset').selectOption('performance');
  const metrics = page.getByTestId('render-resolution');
  const selector = page.getByLabel('Anti-aliasing', { exact: true });
  await expect(metrics).toHaveAttribute('data-aa-active', 'off');
  const baseline = await roofPixels(page);
  const supported = (await metrics.getAttribute('data-aa-supported'))!.split(
    ',',
  ) as AntiAliasingMode[];
  for (const mode of supported.filter((mode) => mode !== 'off')) {
    await selector.selectOption(mode);
    await expect(metrics).toHaveAttribute('data-aa-active', mode);
    await expect(metrics).toHaveAttribute('data-aa-loading', 'false');
    await expect(metrics).toHaveAttribute(
      'data-aa-samples',
      mode === 'msaa2' ? '2' : mode === 'msaa4' ? '4' : '0',
    );
    await expect(metrics).toHaveAttribute(
      'data-aa-passes',
      mode === 'fxaa' ? '1' : mode === 'smaa' ? '3' : '0',
    );
    const pixels = await roofPixels(page);
    let changed = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        Math.abs(pixels[i]! - baseline[i]!) > 2 ||
        Math.abs(pixels[i + 1]! - baseline[i + 1]!) > 2
      )
        changed++;
    expect(changed, mode).toBeGreaterThan(20);
  }
  // Settings changes retain one selected technique and resize its buffers/uniforms.
  await page.getByLabel('Resolution preset').selectOption('quality');
  await selector.selectOption('fxaa');
  await expect(metrics).toHaveAttribute('data-width', '1280');
  await expect(metrics).toHaveAttribute('data-aa-active', 'fxaa');
  await page.setViewportSize({ width: 960, height: 640 });
  await expect(metrics).toHaveAttribute('data-output-width', '960');
  await expect(metrics).toHaveAttribute('data-aa-active', 'fxaa');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  await expect(metrics).toHaveAttribute('data-aa-active', 'fxaa');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  if (supported.includes('smaa')) await selector.selectOption('smaa'); // Cancel pending lazy loading.
  await selector.selectOption('off');
  await expect(metrics).toHaveAttribute('data-aa-active', 'off');
  await expect(metrics).toHaveAttribute('data-aa-passes', '0');
  await expect(metrics).toHaveAttribute('data-aa-samples', '0');
  expect(errors).toEqual([]);
});

test('unsupported saved modes fall back to FXAA and unavailable choices are disabled', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'msaa4',
      }),
    );
    const proto = WebGL2RenderingContext.prototype;
    const formats = proto.getInternalformatParameter;
    proto.getInternalformatParameter = function (target, format, name) {
      if (name === this.SAMPLES) return new Int32Array();
      return formats.call(this, target, format, name);
    };
    const extension = proto.getExtension;
    Object.defineProperty(proto, 'getExtension', {
      value: function (this: WebGL2RenderingContext, name: string) {
        return name === 'EXT_color_buffer_float'
          ? null
          : Reflect.apply(extension, this, [name]);
      },
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'ENTER TRAINING' }),
  ).toBeEnabled();
  const metrics = page.getByTestId('render-resolution');
  await expect(metrics).toHaveAttribute('data-aa-requested', 'msaa4');
  await expect(metrics).toHaveAttribute('data-aa-active', 'fxaa');
  await expect(metrics).toHaveAttribute('data-aa-samples', '0');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('tab', { name: /DISPLAY/ }).click();
  const selector = page.getByLabel('Anti-aliasing', { exact: true });
  for (const mode of ['smaa', 'msaa2', 'msaa4'])
    await expect(selector.locator(`option[value="${mode}"]`)).toBeDisabled();
  await expect(page.getByTestId('aa-status')).toContainText(
    'Active anti-aliasing: FXAA',
  );
  await selector.selectOption('fxaa');
  await expect(metrics).toHaveAttribute('data-aa-active', 'fxaa');
});
