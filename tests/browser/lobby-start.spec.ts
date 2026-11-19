import { expect, test, type Page } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

async function hostLobby(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Host');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const peer = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    (await page.getByTestId('room-code').textContent())!,
    { name: 'Guest' },
  );
  for (const type of ['shot', 'kill', 'correction', 'notice'])
    peer.onMessage(type, () => {});
  return peer;
}
async function expectPlaying(page: Page) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement?.tagName))
    .toBe('CANVAS');
  await expect(page.getByTestId('weapon-status')).toBeVisible();
  await expect(page.locator('.crosshair')).toBeVisible();
}

test('starting the session takes the host straight from the lobby into gameplay and does not recapture after Escape', async ({
  page,
}) => {
  const peer = await hostLobby(page);
  try {
    await expect(
      page.getByRole('button', { name: 'START SESSION' }),
    ).toBeDisabled();
    await expect(page.getByRole('dialog')).toBeVisible();
    peer.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await expectPlaying(page); // No modal-close or Enter Room click.
    await page.keyboard.down('w');
    await expect
      .poll(() => peer.state.players.get(peer.state.hostId)?.z)
      .toBeLessThan(11);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'ENTER ROOM' }),
    ).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await page.getByRole('button', { name: 'ROOM LOBBY' }).click();
    await page.waitForTimeout(1100);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: 'test-results/session-opened-lobby.png' });
  } finally {
    await peer.leave();
  }
});

test('a focused joined browser enters when the host starts the match remotely', async ({
  page,
}) => {
  const host = await new Client('http://127.0.0.1:2567').create<RoomState>(
    'depot',
    { name: 'Remote host' },
  );
  for (const type of ['shot', 'kill', 'correction', 'notice'])
    host.onMessage(type, () => {});
  try {
    await page.goto(`/?room=${host.roomId}`);
    await page.getByLabel('PLAYER NAME').fill('Joined player');
    await page.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
    await page.getByRole('button', { name: 'READY UP', exact: true }).click();
    await expect
      .poll(() =>
        [...host.state.players.values()].every((player) => player.ready),
      )
      .toBe(true);
    host.send('start');
    await expectPlaying(page);
    await page.screenshot({ path: 'test-results/session-guest-auto-play.png' });
  } finally {
    await host.leave();
  }
});

test('denied automatic mouse capture shows one arena play button and recovers on its click', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.requestPointerLock;
    let initial = true;
    HTMLCanvasElement.prototype.requestPointerLock = function (options) {
      if (initial) {
        initial = false;
        return Promise.reject(
          new DOMException('A fresh click is required', 'NotAllowedError'),
        );
      }
      return original.call(this, options);
    };
  });
  const peer = await hostLobby(page);
  try {
    peer.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'CLICK TO PLAY', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/session-click-to-play.png' });
    await page
      .getByRole('button', { name: 'CLICK TO PLAY', exact: true })
      .click();
    await expectPlaying(page);
  } finally {
    await peer.leave();
  }
});
