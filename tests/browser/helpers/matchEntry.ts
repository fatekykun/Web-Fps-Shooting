import { expect, type Page } from '@playwright/test';

/** Match start now dismisses the lobby; only browser capture restrictions need a click. */
export async function enterStartedMatch(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => document.pointerLockElement !== null)) ||
        (await page
          .getByRole('button', { name: 'CLICK TO PLAY', exact: true })
          .isVisible()),
    )
    .toBeTruthy();
  if (!(await page.evaluate(() => document.pointerLockElement !== null)))
    await page
      .getByRole('button', { name: 'CLICK TO PLAY', exact: true })
      .click();
  await expect(page.locator('.crosshair')).toBeVisible();
  await expect(page.getByTestId('match-status')).toHaveAttribute(
    'data-phase',
    'playing',
  );
}
