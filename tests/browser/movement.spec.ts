import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  // Freeze simulation between trusted key events, then run every animation frame explicitly.
  // Otherwise remote protocol latency can outlast a 650 ms action being inspected.
  await page.clock.install({ time: new Date('2026-11-15T00:00:00Z') });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'ENTER TRAINING' });
  await expect(button).toBeEnabled();
  await page.clock.pauseAt(new Date('2026-11-15T01:00:00Z'));
  await page.screenshot({ path: 'test-results/depot-movement-entry.png' });
  await button.click({ force: true });
  await expect(page.locator('.crosshair')).toBeVisible();
  await page.clock.runFor(300);
  await expect(
    page.getByRole('complementary', { name: 'Live performance metrics' }),
  ).not.toContainText('NaN');
}

async function sprint(page: Page) {
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.clock.runFor(1200);
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    7.5,
  );
}

test('sprint, tap slide and jump cancel retain momentum through real input', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await sprint(page);
  await page.keyboard.press('c');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sliding',
  );
  await page.keyboard.down('Space');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'airborne',
  );
  expect(
    Number(await page.getByTestId('position').getAttribute('data-y')),
  ).toBeGreaterThan(1.1);
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    6,
  );
  await page.keyboard.up('Space');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'RESUME TRAINING' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('backslide and dolphin dive recover to a standing sprint', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await sprint(page);
  await page.keyboard.up('w');
  await page.keyboard.down('s');
  await page.keyboard.press('c');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'backsliding',
  );
  expect(
    Number(await page.getByTestId('position').getAttribute('data-half-height')),
  ).toBeLessThanOrEqual(0.31);
  await page.keyboard.up('s');
  await page.keyboard.down('w');
  await page.clock.runFor(1500);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sprinting',
  );
  expect(Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(
    7.5,
  );
  await page.keyboard.press('x');
  await page.clock.runFor(300);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'diving',
  );
  await page.screenshot({ path: 'test-results/depot-dive.png' });
  await page.clock.runFor(1200);
  await expect(page.getByTestId('position')).toHaveAttribute(
    'data-state',
    'sprinting',
  );
  expect(
    Number(await page.getByTestId('position').getAttribute('data-half-height')),
  ).toBeCloseTo(0.55);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
