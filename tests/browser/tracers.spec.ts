import { expect, test } from '@playwright/test';
import { weaponConfigs, weaponOrder } from '@breakpoint/shared';

for (const preset of ['performance', 'ultra'] as const) {
  test(`barrel trails fade in ADS and preserve all weapon/scope sights at ${preset} resolution`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    if (preset === 'ultra')
      await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript((preset) => {
      localStorage.setItem(
        'breakpoint.graphics.v2',
        JSON.stringify({ preset, adaptive: false, antiAliasing: 'off' }),
      );
      localStorage.setItem(
        'breakpoint.settings.v1',
        JSON.stringify({ scopeStyle: 'optic' }),
      );
    }, preset);
    await page.clock.install({ time: new Date('2026-11-18T00:00:00Z') });
    await page.goto('/');
    const enter = page.getByRole('button', { name: 'ENTER TRAINING' });
    await expect(enter).toBeEnabled();
    await enter.click();
    await page.clock.pauseAt(new Date('2026-11-18T01:00:00Z'));
    await page.clock.runFor(350);
    const metrics = page.locator('.telemetry'),
      hud = page.getByTestId('weapon-status');
    const metric = async (name: string) =>
      Number(await metrics.getAttribute(`data-${name}`));
    for (const [index, id] of weaponOrder.entries()) {
      await page.keyboard.press(String(index + 1));
      await page.clock.runFor(350);
      await expect(hud).toHaveAttribute('data-weapon', id);
      expect(await metric('trail-opacity')).toBeCloseTo(0.52, 2);
      const before = await metric('trails-emitted');
      await page.mouse.down();
      await page.clock.runFor(32);
      await page.mouse.up();
      await page.screenshot({
        path: `test-results/bp12-${preset}-${id}-hip.png`,
      });
      await page.clock.runFor(300);
      expect((await metric('trails-emitted')) - before).toBe(
        weaponConfigs[id].pellets,
      );
      await page.mouse.down({ button: 'right' });
      await page.clock.runFor(1400);
      const targetOpacity = id === 'sniper' ? 0.08 : 0.14;
      expect(await metric('trail-opacity')).toBeCloseTo(targetOpacity, 2);
      expect(await metric('trail-thickness')).toBeLessThan(0.006);
      expect(await metric('trail-length')).toBeLessThan(2.6);
      const confirmed = await metric('trails-emitted');
      await page.mouse.down();
      await page.clock.runFor(32);
      await page.mouse.up();
      await page.screenshot({
        path: `test-results/bp12-${preset}-${id}-ads.png`,
      });
      await page.clock.runFor(300);
      expect((await metric('trails-emitted')) - confirmed).toBe(
        weaponConfigs[id].pellets,
      );
      if (id === 'sniper')
        await expect(page.getByTestId('sniper-scope')).toHaveCSS(
          'opacity',
          '1',
        );
      await page.mouse.up({ button: 'right' });
      await page.clock.runFor(700);
      expect(await metric('trail-opacity')).toBeCloseTo(0.52, 2);
      expect(await metric('trails')).toBe(0);
    }
    // Sustained SMG fire exercises overlapping pooled effects and the protected sight picture.
    await page.keyboard.press('2');
    await page.clock.runFor(300);
    await page.mouse.down({ button: 'right' });
    await page.clock.runFor(600);
    await page.mouse.down();
    await page.clock.runFor(528);
    await page.screenshot({
      path: `test-results/bp12-${preset}-continuous-ads.png`,
    });
    await page.mouse.up();
    await page.mouse.up({ button: 'right' });
    await page.clock.runFor(300);
    expect(await metric('trails')).toBe(0);
    expect(errors).toEqual([]);
  });
}
