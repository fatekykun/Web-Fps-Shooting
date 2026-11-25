import { expect, type Page } from '@playwright/test';
import type { Client } from '@colyseus/sdk';
import type { RoomState } from '../../../apps/server/src/rooms/RoomState';

/** Shipment alternates FFA slots across the yard. Reserve one to stage two peers side by side. */
export async function reserveSpawnSlot(
  client: Client,
  code: string,
  name = 'South slot',
) {
  const peer = await client.joinById<RoomState>(code, { name });
  for (const type of ['shot', 'kill', 'notice', 'correction'])
    peer.onMessage(type, () => {});
  peer.send('ready', true);
  return peer;
}

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
