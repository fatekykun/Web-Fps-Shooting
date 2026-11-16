import { expect, test } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

test('a shared website invite opens Join with the code filled and joins after entering a callsign', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const host = await new Client('http://127.0.0.1:2567').create<RoomState>(
    'depot',
    { name: 'Invite host' },
  );
  host.onMessage('correction', () => {});
  host.onMessage('notice', () => {});
  try {
    await page.goto(`/?room=${host.roomId.toLowerCase()}`);
    await expect(page.getByRole('tab', { name: 'JOIN ROOM' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('ROOM CODE', { exact: true })).toHaveValue(
      host.roomId,
    );
    await page.getByLabel('PLAYER NAME').fill('Invited friend');
    await page.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
    await expect(page.getByTestId('room-code')).toHaveText(host.roomId);
    await expect(
      page.getByRole('list', { name: 'Players' }).getByRole('listitem'),
    ).toHaveCount(2);
    await page.getByRole('button', { name: 'READY UP' }).click();
    await expect
      .poll(
        () =>
          [...host.state.players.values()].find(
            (player) => player.name === 'Invited friend',
          )?.ready,
      )
      .toBe(true);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'LEAVE ROOM' })
      .click();
    await expect.poll(() => host.state.players.size).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await host.leave();
  }
});
