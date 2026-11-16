import { expect, test } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

test('creates and joins a private room, starts, synchronizes movement and leaves cleanly', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const guestContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const guest = await guestContext.newPage();
  guest.on('pageerror', (error) => errors.push(error.message));
  let observer;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await page.getByLabel('PLAYER NAME').fill('Raven');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
    const code = await page.getByTestId('room-code').textContent();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await page.getByRole('button', { name: 'COPY CODE' }).click();
    await expect(page.getByRole('status')).toContainText(
      /CODE COPIED|CODE SELECTED/,
    );
    await page.getByRole('button', { name: 'COPY INVITE' }).click();
    await expect(page.getByLabel('Room invite link')).toHaveValue(
      `http://127.0.0.1:4173/?room=${code}`,
    );
    await expect(page.getByRole('status')).toContainText(
      /INVITE COPIED|INVITE SELECTED/,
    );
    await page.screenshot({ path: 'test-results/retro-lobby.png' });
    await guest.goto('http://127.0.0.1:4173');
    await guest.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
    await guest.getByRole('tab', { name: 'JOIN ROOM', exact: true }).click();
    await guest.getByLabel('PLAYER NAME').fill('Kestrel');
    await guest.getByLabel('ROOM CODE', { exact: true }).fill(code!);
    await guest.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
    await expect(guest.getByTestId('room-code')).toHaveText(code!);
    await expect(
      page.getByRole('list', { name: 'Players' }).getByRole('listitem'),
    ).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'START SESSION' }),
    ).toBeDisabled();
    await guest.getByRole('button', { name: 'READY UP' }).click();
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await expect(
      guest.getByText('Session in progress.', { exact: false }),
    ).toBeVisible();
    await page.screenshot({ path: 'test-results/private-room-lobby.png' });

    observer = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
      code!,
      { name: 'Observer' },
    );
    observer.onMessage('correction', () => {});
    observer.onMessage('notice', () => {});
    await expect.poll(() => observer!.state?.players?.size).toBe(3);
    const hostId = observer.state.hostId;
    await page.getByRole('button', { name: 'BACK TO ARENA' }).click();
    await page.getByRole('button', { name: 'ENTER ROOM' }).click();
    await expect(page.locator('.crosshair')).toBeVisible();
    await page.keyboard.down('w');
    await expect
      .poll(() => observer!.state.players.get(hostId)?.z)
      .toBeLessThan(10.5);
    await page.keyboard.up('w');
    // Look back toward the other spawn slots for a visual check of real remote bodies.
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 1000 }));
    });
    await expect(page.getByTestId('network-status')).toHaveAttribute(
      'data-peers',
      '2',
    );
    await expect
      .poll(async () =>
        Number(
          await page.getByTestId('network-status').getAttribute('data-ack'),
        ),
      )
      .toBeGreaterThan(20);
    await page.screenshot({ path: 'test-results/private-room-playing.png' });
    await page.keyboard.press('Escape');
    // Mouse release keeps the room simulation alive, sending neutral inputs.
    const ack = Number(
      await page.getByTestId('network-status').getAttribute('data-ack'),
    );
    await expect
      .poll(async () =>
        Number(
          await page.getByTestId('network-status').getAttribute('data-ack'),
        ),
      )
      .toBeGreaterThan(ack + 5);
    await page.getByRole('button', { name: 'ROOM LOBBY' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'LEAVE ROOM' })
      .click();
    await expect(
      page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }),
    ).toBeVisible();
    await expect(
      guest.getByRole('list', { name: 'Players' }).getByRole('listitem'),
    ).toHaveCount(2);
    await page.getByRole('button', { name: 'Close rooms' }).click();
    await expect(
      page.getByRole('button', { name: 'RESUME TRAINING' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await observer?.leave();
    await guestContext.close();
  }
});
