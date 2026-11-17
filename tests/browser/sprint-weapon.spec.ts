import { expect, test } from '@playwright/test';
import { weaponConfigs, weaponOrder } from '@breakpoint/shared';

test('sprint carry, fire and ADS preserve all four weapons and smoothly restore walking', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'off',
      }),
    ),
  );
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
    if (index > 0)
      await page.evaluate(
        (angle) =>
          document.dispatchEvent(
            new MouseEvent('mousemove', { movementX: -angle / 0.002 }),
          ),
        index % 2 ? Math.PI : -Math.PI,
      );
    await page.keyboard.press(String(index + 1));
    await page.clock.runFor(300);
    await expect(hud).toHaveAttribute('data-weapon', id);
    await page.keyboard.down('w');
    await page.clock.runFor(256);
    await expect(page.getByTestId('position')).toHaveAttribute(
      'data-state',
      'walking',
    );
    await page.screenshot({ path: `test-results/bp05-${id}-walking.png` });
    await page.keyboard.down('Shift');
    await page.clock.runFor(700);
    await expect(page.getByTestId('position')).toHaveAttribute(
      'data-state',
      'sprinting',
    );
    expect(
      Number(await page.getByTestId('speed').textContent()),
    ).toBeGreaterThan(7.5);
    await page.screenshot({ path: `test-results/bp05-${id}-sprint.png` });
    expect(
      Number(
        await page
          .getByTestId('render-resolution')
          .getAttribute('data-world-draws'),
      ),
    ).toBeLessThan(11);
    await page.mouse.down();
    await page.clock.runFor(64);
    await page.mouse.up();
    expect(Number(await hud.getAttribute('data-ammo'))).toBeLessThan(
      weaponConfigs[id].magazine,
    );
    await page.mouse.down({ button: 'right' });
    await page.clock.runFor(500);
    expect(Number(await hud.getAttribute('data-ads'))).toBeGreaterThan(0.9);
    await expect(page.getByTestId('position')).toHaveAttribute(
      'data-state',
      'sprinting',
    );
    await page.screenshot({ path: `test-results/bp05-${id}-sprint-ads.png` });
    await page.keyboard.up('Shift');
    await page.keyboard.up('w');
    await page.mouse.up({ button: 'right' });
    await page.clock.runFor(800);
    await expect(page.getByTestId('position')).toHaveAttribute(
      'data-state',
      'walking',
    );
    expect(Number(await page.getByTestId('speed').textContent())).toBeLessThan(
      0.1,
    );
    await page.screenshot({ path: `test-results/bp05-${id}-idle.png` });
    await page.keyboard.press('r');
    await page.clock.runFor(300);
    await expect(hud).toHaveAttribute('data-reloading', 'true');
    await page.clock.runFor(3000);
    await expect(hud).toHaveAttribute(
      'data-ammo',
      String(weaponConfigs[id].magazine),
    );
  }
  expect(errors).toEqual([]);
});
