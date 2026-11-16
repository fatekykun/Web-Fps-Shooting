import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.clock.install({ time: new Date('2026-11-16T00:00:00Z') });
  await page.goto('/');
  const enter = page.getByRole('button', { name: 'ENTER TRAINING' });
  await expect(enter).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-11-16T01:00:00Z'));
  await enter.click({ force: true });
  await page.clock.runFor(300);
  await expect(page.getByTestId('weapon-status')).toHaveAttribute(
    'data-ammo',
    '30',
  );
}

test('responsive ADS, local hits, recoil, reload and weapon switching', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await enter(page);
  const hud = page.getByTestId('weapon-status');
  const hipSpread = Number(await hud.getAttribute('data-spread'));
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(350);
  expect(Number(await hud.getAttribute('data-ads'))).toBeGreaterThan(0.9);
  expect(Number(await hud.getAttribute('data-fov'))).toBeLessThan(65);
  expect(Number(await hud.getAttribute('data-spread'))).toBeLessThan(hipSpread);
  await page.mouse.down({ button: 'left' });
  await page.clock.runFor(80);
  await page.mouse.up({ button: 'left' });
  await expect(hud).toHaveAttribute('data-ammo', '29');
  await expect(hud).toHaveAttribute('data-hits', '1');
  await expect(page.getByTestId('dummy-status')).toHaveAttribute(
    'data-health',
    '75',
  );
  expect(Number(await hud.getAttribute('data-recoil'))).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/depot-ads.png' });
  await page.mouse.up({ button: 'right' });
  await page.clock.runFor(350);
  expect(Number(await hud.getAttribute('data-fov'))).toBeGreaterThan(80);
  await page.keyboard.press('r');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await expect(hud).toHaveAttribute('data-ammo', '29');
  await page.clock.runFor(2100);
  await expect(hud).toHaveAttribute('data-ammo', '30');
  await expect(hud).toHaveAttribute('data-reserve', '119');
  await page.keyboard.press('2');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-weapon', 'smg');
  await expect(hud).toHaveAttribute('data-ammo', '35');
  await page.mouse.down({ button: 'left' });
  await page.clock.runFor(300);
  await page.mouse.up({ button: 'left' });
  expect(Number(await hud.getAttribute('data-ammo'))).toBeLessThan(32);
  await page.keyboard.press('1');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-ammo', '30');
  await expect(hud).toHaveAttribute('data-reserve', '119');
  expect(errors).toEqual([]);
});

test('shotgun requires fresh presses and reload pauses safely with training', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  const hud = page.getByTestId('weapon-status');
  await page.keyboard.press('3');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-weapon', 'shotgun');
  await page.mouse.down({ button: 'left' });
  await page.clock.runFor(1400);
  await expect(hud).toHaveAttribute('data-ammo', '7');
  await page.mouse.up({ button: 'left' });
  await page.screenshot({ path: 'test-results/depot-shotgun.png' });
  await page.keyboard.press('r');
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await page.keyboard.press('Escape');
  await page.clock.runFor(4000);
  await page
    .getByRole('button', { name: 'RESUME TRAINING' })
    .click({ force: true });
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await expect(hud).toHaveAttribute('data-ammo', '7');
  await page.clock.runFor(2200);
  await expect(hud).toHaveAttribute('data-ammo', '8');
  await expect(hud).toHaveAttribute('data-reserve', '39');
  expect(errors).toEqual([]);
});
