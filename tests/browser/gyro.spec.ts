import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
});

const labels = [
  'Steering Gyro Sensitivity',
  'Gyro ADS Sensitivity',
  'Gyro Sniper Scope Sensitivity',
  'Gyro Vertical Turning Sensitivity',
];

async function openSensitivity(page: Page) {
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
  await page.getByRole('tab', { name: /SENSITIVITY/ }).tap();
}

test('requests permission, saves gyro settings, and applies horizontal inversion during play', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceMotionEvent, 'requestPermission', {
      value: () =>
        Promise.resolve(
          sessionStorage.getItem('allowMotion') === 'yes'
            ? 'granted'
            : 'denied',
        ),
    });
    Object.defineProperty(screen.orientation, 'angle', { get: () => 90 });
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error('Fullscreen denied'));
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({ preset: 'performance', adaptive: false }),
    );
  });
  await page.goto('/');
  const gyro = page.getByRole('group', { name: 'Gyro aiming' });
  const alwaysOn = gyro.getByRole('button', { name: 'Always on' });
  const gyroOff = gyro.getByRole('button', { name: 'Off', exact: true });
  const invertHorizontal = page.getByRole('switch', {
    name: 'Invert Horizontal Gyroscope',
  });
  const invertVertical = page.getByRole('switch', {
    name: 'Invert Vertical Gyroscope',
  });
  await openSensitivity(page);
  await expect(gyroOff).toHaveAttribute('aria-pressed', 'true');
  await alwaysOn.tap();
  await expect(page.getByText(/Allow motion sensor access/)).toBeVisible();
  await expect(gyroOff).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => sessionStorage.setItem('allowMotion', 'yes'));
  await alwaysOn.tap();
  await expect(alwaysOn).toHaveAttribute('aria-pressed', 'true');
  const mapping = page.getByLabel('Gyro sensitivity mapping');
  await expect(mapping).toHaveValue('reference');
  await mapping.selectOption('legacy');
  await expect(invertHorizontal).not.toBeChecked();
  await expect(invertVertical).not.toBeChecked();
  await invertHorizontal.tap();
  await invertVertical.tap();

  const values = ['300', '55', '83', '180'];
  for (const [index, label] of labels.entries()) {
    const slider = page.getByRole('slider', { name: label, exact: true });
    await slider.fill(values[index]!);
    await expect(slider.locator('..').locator('output')).toHaveText(
      values[index]!,
    );
  }
  for (const label of [
    'Camera Steering Sensitivity',
    'Firing ADS Sensitivity',
    'Touch general camera',
  ]) {
    await expect(
      page
        .getByRole('slider', { name: label, exact: true })
        .locator('..')
        .locator('output'),
    ).toHaveText('100');
  }
  await page.reload();
  await openSensitivity(page);
  await expect(alwaysOn).toHaveAttribute('aria-pressed', 'true');
  await expect(mapping).toHaveValue('legacy');
  await expect(invertHorizontal).toBeChecked();
  await expect(invertVertical).toBeChecked();
  for (const [index, label] of labels.entries())
    await expect(
      page.getByRole('slider', { name: label, exact: true }),
    ).toHaveValue(values[index]!);
  await page.getByRole('button', { name: 'Close settings' }).tap();
  const enter = page.getByRole('button', { name: /^(ENTER|RESUME) TRAINING$/ });
  await enter.tap();

  const marker = page.getByTestId('minimap-player');
  const heading = () =>
    marker.evaluate((element) =>
      Number(
        (element as HTMLElement).style.transform.match(
          /rotate\(([-.\de]+)rad\)/,
        )?.[1],
      ),
    );
  await expect.poll(heading).toBeCloseTo(0);
  const tilt = () =>
    page.evaluate(() => {
      for (const time of [1000, 1020, 1040]) {
        const event = new DeviceMotionEvent('devicemotion', {
          rotationRate: { alpha: 0, beta: 15, gamma: 0 },
        });
        Object.defineProperty(event, 'timeStamp', { value: time });
        window.dispatchEvent(event);
      }
    });
  await tilt();
  await expect.poll(heading).toBeCloseTo((15 * Math.PI * 0.04 * 12) / 180);

  await page.getByRole('button', { name: 'Pause game' }).tap();
  await openSensitivity(page);
  await gyroOff.tap();
  await expect(gyroOff).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close settings' }).tap();
  await enter.tap();
  await expect(marker).toBeVisible();
  const before = await heading();
  await tilt();
  // Let the minimap receive another telemetry sample after sending motion.
  await page.waitForTimeout(350);
  expect(await heading()).toBeCloseTo(before);
});

test('saves a measured profile and applies vertical-only gyro with a tilted grip', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(screen.orientation, 'angle', { get: () => 90 });
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error('Fullscreen denied'));
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({ preset: 'performance', adaptive: false }),
    );
  });
  await page.goto('/');
  await openSensitivity(page);
  await page.getByRole('button', { name: 'Always on' }).tap();
  const diagnostics = page.getByText('Gyro diagnostics and calibration', {
    exact: true,
  });
  await diagnostics.tap();
  await page
    .getByRole('combobox', { name: 'Axis', exact: true })
    .selectOption('pitch');
  await page.getByLabel('COD Mobile FOV', { exact: true }).fill('Test FOV 75');
  await page.getByLabel('Physical phone rotation (degrees)').fill('10');
  await page.getByLabel('COD Mobile camera rotation (degrees)').fill('20');
  await page.getByRole('button', { name: 'Save measurement' }).tap();
  await expect(page.getByText(/Measurement saved/)).toBeVisible();
  await page.getByLabel('Gyro sensitivity mapping').selectOption('calibrated');

  await page.reload();
  await openSensitivity(page);
  await expect(page.getByLabel('Gyro sensitivity mapping')).toHaveValue(
    'calibrated',
  );
  await diagnostics.tap();
  await expect(page.getByText('Saved measurements (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Start gyro measurement' }).tap();
  await page.getByRole('button', { name: 'Close settings' }).tap();
  await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
  await expect(page.getByTestId('minimap-player')).toBeVisible();
  await page.evaluate(() => {
    for (const time of [1000, 1020, 1040, 1060]) {
      const event = new DeviceMotionEvent('devicemotion', {
        rotationRate: { alpha: 0, beta: 0, gamma: -60 },
        accelerationIncludingGravity: { x: 7.8, y: 4.8, z: 3.5 },
      });
      Object.defineProperty(event, 'timeStamp', { value: time });
      window.dispatchEvent(event);
    }
  });
  await page.getByRole('button', { name: 'Pause game' }).tap();
  await openSensitivity(page);
  await diagnostics.tap();
  await expect(page.getByTestId('gyro-camera-rotation')).toHaveText(
    '0.0° / 7.2°',
  );
  await expect(page.getByText('uncalibrated / measured')).toBeVisible();
});
