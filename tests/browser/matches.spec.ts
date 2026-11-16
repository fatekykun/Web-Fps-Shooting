import { expect, test, type Page } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

async function create(
  page: Page,
  mode: 'ffa' | 'tdm',
  score: number,
  seconds: number,
) {
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Raven');
  await page.getByLabel('GAME MODE').selectOption(mode);
  await page.getByLabel('KILL LIMIT').fill(String(score));
  await page.getByLabel('TIME LIMIT (SECONDS)').fill(String(seconds));
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const code = await page.getByTestId('room-code').textContent();
  const peer = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    code!,
    { name: 'Kestrel' },
  );
  for (const type of ['shot', 'kill', 'correction', 'notice'])
    peer.onMessage(type, () => {});
  peer.send('ready', true);
  return peer;
}
async function enter(page: Page) {
  await page.getByRole('button', { name: 'START SESSION' }).click();
  await page.getByRole('button', { name: 'BACK TO ARENA' }).click();
  await page.getByRole('button', { name: 'ENTER ROOM' }).click();
  await expect(page.locator('.crosshair')).toBeVisible();
}

test('FFA shows server scores, a winner, frozen results and a clean rematch lobby', async ({
  page,
}) => {
  let peer: Room<unknown, RoomState> | undefined;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    peer = await create(page, 'ffa', 1, 30);
    await enter(page);
    await expect(page.getByTestId('ffa-score')).toHaveText('0 / 1 KILLS');
    await expect(page.getByTestId('player-health')).toHaveAttribute(
      'data-health',
      '100',
    );
    await page.keyboard.down('Tab');
    await expect(
      page.getByRole('region', { name: 'Scoreboard', exact: true }),
    ).toBeVisible();
    await page.keyboard.up('Tab');
    await expect(
      page.getByRole('region', { name: 'Scoreboard', exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          movementX: Math.PI / 2 / 0.002,
          movementY: 60,
        }),
      ),
    );
    await page.mouse.down();
    await expect(page.getByTestId('match-result')).toHaveText('Raven WINS', {
      timeout: 20000,
    });
    await page.mouse.up();
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await expect(
      page.getByRole('region', { name: 'Match results' }).getByRole('table'),
    ).toContainText('Kestrel');
    await page.screenshot({ path: 'test-results/ffa-results.png' });
    const round = peer.state.round;
    await page
      .getByRole('button', { name: 'RETURN TO LOBBY', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'WAITING FOR HOST' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'ROOM LOBBY' }).click();
    await expect(
      page.getByRole('button', { name: 'START SESSION' }),
    ).toBeDisabled();
    peer.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await expect.poll(() => peer!.state.round).toBe(round + 1);
    expect(peer.state.scores.get(peer.state.hostId)!.kills).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await peer?.leave();
  }
});

test('TDM displays balanced teams, opposite spawns, team scores, timer and drawn results', async ({
  page,
}) => {
  test.setTimeout(120000);
  let peer: Room<unknown, RoomState> | undefined;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    peer = await create(page, 'tdm', 40, 30);
    await expect(page.getByRole('list', { name: 'Players' })).toContainText(
      'BLUE',
    );
    await expect(page.getByRole('list', { name: 'Players' })).toContainText(
      'ORANGE',
    );
    await page.screenshot({ path: 'test-results/tdm-lobby.png' });
    await enter(page);
    await expect(page.getByTestId('team-score')).toContainText('BLUE 0');
    await expect(page.getByTestId('team-score')).toContainText('0 ORANGE');
    await expect(page.getByTestId('match-timer')).toHaveText(/^0:[0-3][0-9]$/);
    await expect
      .poll(() => peer!.state.players.get(peer!.sessionId)?.z)
      .toBeLessThan(0);
    await page.keyboard.down('Tab');
    await expect(
      page
        .getByRole('region', { name: 'Scoreboard', exact: true })
        .getByRole('table'),
    ).toContainText('ORANGE');
    await page.screenshot({ path: 'test-results/tdm-scoreboard.png' });
    await page.keyboard.up('Tab');
    await expect(page.getByTestId('match-result')).toHaveText('DRAW', {
      timeout: 45000,
    });
    await expect(
      page.getByRole('region', { name: 'Match results' }),
    ).toContainText('Time limit reached.');
    await page.screenshot({ path: 'test-results/tdm-results.png' });
    expect(peer.state.phase).toBe('results');
    expect(peer.state.winningTeam).toBe('draw');
    expect(errors).toEqual([]);
  } finally {
    await peer?.leave();
  }
});
