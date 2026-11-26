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
  const gyro = page.getByRole('checkbox', { name: 'Gyro aiming' });
  const invertHorizontal = page.getByRole('switch', {
    name: 'Invert Horizontal Gyroscope',
  });
  const invertVertical = page.getByRole('switch', {
    name: 'Invert Vertical Gyroscope',
  });
  await openSensitivity(page);
  await expect(gyro).not.toBeChecked();
  await gyro.tap();
  await expect(page.getByText(/Allow motion sensor access/)).toBeVisible();
  await expect(gyro).not.toBeChecked();
  await page.evaluate(() => sessionStorage.setItem('allowMotion', 'yes'));
  await gyro.tap();
  await expect(gyro).toBeChecked();
  await expect(invertHorizontal).not.toBeChecked();
  await expect(invertVertical).not.toBeChecked();
  await invertHorizontal.tap();
  await invertVertical.tap();

  const values = ['150', '55', '83', '180'];
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
  await expect(gyro).toBeChecked();
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
          rotationRate: { alpha: 0, beta: 90, gamma: 0 },
        });
        Object.defineProperty(event, 'timeStamp', { value: time });
        window.dispatchEvent(event);
      }
    });
  await tilt();
  await expect.poll(heading).toBeCloseTo((90 * Math.PI * 0.04 * 1.5) / 180);

  await page.getByRole('button', { name: 'Pause game' }).tap();
  await openSensitivity(page);
  await gyro.tap();
  await expect(gyro).not.toBeChecked();
  await page.getByRole('button', { name: 'Close settings' }).tap();
  await enter.tap();
  await expect(marker).toBeVisible();
  const before = await heading();
  await tilt();
  // Let the minimap receive another telemetry sample after sending motion.
  await page.waitForTimeout(350);
  expect(await heading()).toBeCloseTo(before);
});
