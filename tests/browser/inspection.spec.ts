import { expect, test } from '@playwright/test';

test('walks and sprints through firearm inspection and interrupts it with fire or ADS', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.settings.v1',
      JSON.stringify({
        loadouts: {
          defaultSlot: 0,
          slots: [
            { weapon: 'rifle', skin: 'standard' },
            { weapon: 'smg', skin: 'standard' },
            { weapon: 'shotgun', skin: 'standard' },
            { weapon: 'sniper', skin: 'standard' },
          ],
        },
      }),
    );
  });
  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.goto('/');
  await page.bringToFront();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-15T01:00:00Z'));
  await page.clock.runFor(300);

  const hud = page.getByTestId('weapon-status');
  const position = page.getByTestId('position');
  const startInspect = async () => {
    await page.keyboard.press('i');
    await page.clock.runFor(340);
    await expect(hud).toHaveAttribute('data-inspecting', 'true');
  };

  await expect(hud).toHaveAttribute('data-rifle-skin', 'standard');
  await page.keyboard.down('w');
  await page.clock.runFor(320);
  await expect(position).toHaveAttribute('data-state', 'walking');
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    3,
  );
  await startInspect();

  await page.keyboard.down('Shift');
  await page.clock.runFor(650);
  await expect(position).toHaveAttribute('data-state', 'sprinting');
  await expect(hud).toHaveAttribute('data-inspecting', 'true');
  await page.clock.runFor(1570);
  await expect(position).toHaveAttribute('data-state', 'sprinting');
  await expect(hud).toHaveAttribute('data-inspecting', 'false');

  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await startInspect();
  await page.mouse.down();
  await page.clock.runFor(50);
  await page.mouse.up();
  await page.clock.runFor(350);
  await expect(hud).toHaveAttribute('data-ammo', '29');
  await expect(hud).toHaveAttribute('data-inspecting', 'false');

  await startInspect();
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(350);
  await expect(hud).toHaveAttribute('data-inspecting', 'false');
  expect(Number(await hud.getAttribute('data-ads'))).toBeGreaterThan(0.9);
  await page.mouse.up({ button: 'right' });
});
