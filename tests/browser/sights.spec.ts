import { expect, test } from '@playwright/test';
import { weaponConfigs, weaponOrder } from '@breakpoint/shared';

for (const preset of ['performance', 'quality'] as const) {
  test(`distinct weapon sights align, fire and switch smoothly at ${preset} resolution`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((preset) => {
      localStorage.setItem(
        'breakpoint.graphics.v2',
        JSON.stringify({
          preset,
          adaptive: false,
          antiAliasing: 'off',
          textureQuality: preset === 'performance' ? 'low' : 'high',
        }),
      );
    }, preset);
    await page.clock.install({ time: new Date('2026-11-17T00:00:00Z') });
    await page.goto('/');
    const enter = page.getByRole('button', { name: 'ENTER TRAINING' });
    await expect(enter).toBeEnabled();
    await page.bringToFront();
    await enter.click();
    await expect(page.locator('.crosshair')).toBeVisible();
    await page.clock.pauseAt(new Date('2026-11-17T01:00:00Z'));
    await page.clock.runFor(300);
    const hud = page.getByTestId('weapon-status');
    for (let index = 0; index < weaponOrder.length; index++) {
      const id = weaponOrder[index]!;
      await page.keyboard.press(String(index + 1));
      await page.clock.runFor(350);
      await expect(hud).toHaveAttribute('data-weapon', id);
      await page.screenshot({
        path: `test-results/bp08-${preset}-${id}-hip.png`,
      });
      await page.mouse.down({ button: 'right' });
      await page.clock.runFor(80);
      await page.screenshot({
        path: `test-results/bp08-${preset}-${id}-raise.png`,
      });
      await page.clock.runFor(1400);
      expect(Number(await hud.getAttribute('data-ads'))).toBeGreaterThan(0.999);
      expect(Number(await hud.getAttribute('data-fov'))).toBeLessThan(
        weaponConfigs[id].adsFov + 0.1,
      );
      await page.screenshot({
        path: `test-results/bp08-${preset}-${id}-ads.png`,
      });
      if (id === 'sniper') {
        await expect(page.getByTestId('sniper-scope')).toHaveCSS(
          'opacity',
          '1',
        );
        await expect(page.locator('.crosshair')).toHaveCSS(
          'visibility',
          'hidden',
        );
      } else {
        await expect(page.locator('.crosshair')).toHaveCSS(
          'visibility',
          id === 'rifle' ? 'hidden' : 'visible',
        );
        if (id === 'rifle') {
          await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
            canvas.dataset.redDotPixels = '';
            requestAnimationFrame(() => {
              const gl = canvas.getContext('webgl2')!;
              const pixels = new Uint8Array(16 * 16 * 4);
              gl.readPixels(
                Math.floor(canvas.width / 2) - 8,
                Math.floor(canvas.height / 2) - 8,
                16,
                16,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixels,
              );
              let red = 0;
              for (let i = 0; i < pixels.length; i += 4)
                if (
                  pixels[i]! > 180 &&
                  pixels[i]! > pixels[i + 1]! * 2 &&
                  pixels[i]! > pixels[i + 2]! * 2
                )
                  red++;
              canvas.dataset.redDotPixels = String(red);
            });
          });
          await page.clock.runFor(32);
          expect(
            Number(
              await page.locator('canvas').getAttribute('data-red-dot-pixels'),
            ),
          ).toBeGreaterThan(0);
        }
        await expect(page.getByTestId('sniper-scope')).toHaveCSS(
          'opacity',
          '0',
        );
        expect(
          Number(
            await page
              .getByTestId('render-resolution')
              .getAttribute('data-world-draws'),
          ),
        ).toBeLessThan(11);
      }
      const hits = Number(await hud.getAttribute('data-hits'));
      await page.mouse.down();
      await page.clock.runFor(32);
      await page.mouse.up();
      await expect(hud).toHaveAttribute(
        'data-ammo',
        String(weaponConfigs[id].magazine - 1),
      );
      expect(Number(await hud.getAttribute('data-hits'))).toBeGreaterThan(hits);
      await page.mouse.up({ button: 'right' });
      await page.clock.runFor(2500);
      expect(Number(await hud.getAttribute('data-ads'))).toBeLessThan(0.001);
    }
    // Keep ADS held while switching back through the weapon-specific sights.
    await page.mouse.down({ button: 'right' });
    for (const [key, id] of [
      ['3', 'shotgun'],
      ['2', 'smg'],
      ['1', 'rifle'],
    ] as const) {
      await page.keyboard.press(key);
      await page.clock.runFor(1200);
      await expect(hud).toHaveAttribute('data-weapon', id);
      expect(Number(await hud.getAttribute('data-ads'))).toBeGreaterThan(0.99);
      await expect(page.getByTestId('sniper-scope')).toHaveCSS('opacity', '0');
      await page.screenshot({
        path: `test-results/bp08-${preset}-${id}-switch-ads.png`,
      });
    }
    await page.mouse.up({ button: 'right' });
    await page.clock.runFor(500);
    expect(errors).toEqual([]);
  });
}
