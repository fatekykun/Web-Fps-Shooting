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
  await page.clock.runFor(180);
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

test('rifle ADS spray climbs and sweeps the actual view before recovering', async ({
  page,
}) => {
  await enter(page);
  const hud = page.getByTestId('weapon-status');
  const marker = page.getByTestId('minimap-player');
  const pitch = async () =>
    (Number(await hud.getAttribute('data-recoil')) * 180) / Math.PI;
  const heading = () =>
    marker.evaluate((element) => {
      const rotation = new DOMMatrix(getComputedStyle(element).transform);
      return (Math.atan2(rotation.b, rotation.a) * 180) / Math.PI;
    });
  await page.mouse.down({ button: 'right' });
  await page.clock.runFor(448);
  const initialHeading = await heading();
  await page.mouse.down({ button: 'left' });
  await page.clock.runFor(380);
  const earlyPitch = await pitch();
  const firstSweep = await heading();
  expect(earlyPitch).toBeGreaterThan(1.6);
  expect(Math.abs(firstSweep - initialHeading)).toBeGreaterThan(0.65);
  await page.clock.runFor(460);
  expect(await pitch()).toBeGreaterThan(3.2);
  expect(Math.abs((await heading()) - firstSweep)).toBeGreaterThan(0.65);
  await page.mouse.up({ button: 'left' });
  await page.clock.runFor(800);
  expect(await pitch()).toBeLessThan(0.02);
  expect(Math.abs((await heading()) - initialHeading)).toBeLessThan(0.02);
  await page.mouse.up({ button: 'right' });
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
  await page.clock.runFor(300);
  await expect(hud).toHaveAttribute('data-ammo', '8');
  await expect(hud).toHaveAttribute('data-reserve', '39');
  expect(errors).toEqual([]);
});

test('shotgun adds shells one at a time and restarts reload after firing the only shell', async ({
  page,
}) => {
  await enter(page);
  const hud = page.getByTestId('weapon-status');
  const tapFire = async () => {
    await page.mouse.down();
    await page.clock.runFor(60);
    await page.mouse.up();
  };
  await page.keyboard.press('3');
  await page.clock.runFor(300);
  for (let shell = 8; shell > 0; shell--) {
    await tapFire();
    if (shell > 1) await page.clock.runFor(790);
  }
  await expect(hud).toHaveAttribute('data-shots', '8');
  await expect(hud).toHaveAttribute('data-ammo', '0');
  await expect(hud).toHaveAttribute('data-reloading', 'true');

  await page.clock.runFor(800);
  await expect(hud).toHaveAttribute('data-ammo', '1');
  await expect(hud).toHaveAttribute('data-reserve', '39');
  await expect(hud).toHaveAttribute('data-reloading', 'true');
  await tapFire();
  await expect(hud).toHaveAttribute('data-shots', '9');
  await expect(hud).toHaveAttribute('data-ammo', '0');
  await expect(hud).toHaveAttribute('data-reloading', 'true');

  await page.clock.runFor(1600);
  await expect(hud).toHaveAttribute('data-ammo', '2');
  await expect(hud).toHaveAttribute('data-reserve', '37');
  await tapFire();
  await expect(hud).toHaveAttribute('data-shots', '10');
  await expect(hud).toHaveAttribute('data-ammo', '1');
  await expect(hud).toHaveAttribute('data-reloading', 'false');
  await page.clock.runFor(850);
  await expect(hud).toHaveAttribute('data-ammo', '1');
  await expect(hud).toHaveAttribute('data-reserve', '37');
});
