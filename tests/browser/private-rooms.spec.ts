import { enterStartedMatch } from './helpers/matchEntry';
import { expect, test } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { weaponOrder, weaponConfigs, type WeaponId } from '@breakpoint/shared';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';

test('private room controls preserve unrestricted defaults, validate one/two choices and retain settings on mode changes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Host');
  const create = page.getByRole('button', { name: 'CREATE PRIVATE ROOM' });
  await expect(
    page.getByRole('combobox', { name: 'PLAYER LIMIT', exact: true }),
  ).toHaveValue('8');
  await expect(
    page
      .getByRole('combobox', { name: 'PLAYER LIMIT', exact: true })
      .locator('option'),
  ).toHaveText(['2 Players', '4 Players', '6 Players', '8 Players']);
  await expect(create).toBeEnabled();
  await expect(page.getByTestId('weapon-selection-count')).toHaveText(
    'UNRESTRICTED',
  );
  await page.getByLabel('Restrict weapons', { exact: true }).check();
  await expect(create).toBeDisabled();
  await expect(page.getByTestId('weapon-selection-count')).toHaveText(
    '0/2 SELECTED',
  );
  await page.getByLabel('Sniper', { exact: true }).check();
  await expect(page.getByTestId('weapon-selection-count')).toHaveText(
    '1/2 SELECTED',
  );
  await expect(create).toBeEnabled();
  await page.getByLabel('Shotgun', { exact: true }).check();
  await expect(page.getByLabel('Rifle', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('SMG', { exact: true })).toBeDisabled();
  await page.getByLabel('Shotgun', { exact: true }).uncheck();
  await expect(page.getByLabel('Rifle', { exact: true })).toBeEnabled();
  await page.getByLabel('Sniper', { exact: true }).uncheck();
  await expect(create).toBeDisabled();
  await page.getByLabel('Restrict weapons', { exact: true }).uncheck();
  await expect(create).toBeEnabled();
  await page.getByLabel('Restrict weapons', { exact: true }).check();
  await page.getByLabel('Rifle', { exact: true }).check();
  await page.getByLabel('SMG', { exact: true }).check();
  await page
    .getByRole('combobox', { name: 'PLAYER LIMIT', exact: true })
    .selectOption('4');
  await page
    .getByRole('combobox', { name: 'GAME MODE', exact: true })
    .selectOption('tdm');
  await expect(
    page.getByRole('combobox', { name: 'PLAYER LIMIT', exact: true }),
  ).toHaveValue('4');
  await expect(page.getByLabel('Rifle', { exact: true })).toBeChecked();
  await expect(page.getByLabel('SMG', { exact: true })).toBeChecked();
  await expect(page.getByTestId('weapon-selection-count')).toHaveText(
    '2/2 SELECTED',
  );
  await page.setViewportSize({ width: 640, height: 640 });
  await page.getByTestId('weapon-selection-count').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('weapon-selection-count')).toBeVisible();
  const panel = page.getByRole('dialog');
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/bp09-create-640.png' });
});

for (const scenario of [
  { allowed: ['sniper'] as WeaponId[], cap: 2, mode: 'ffa' },
  { allowed: ['shotgun'] as WeaponId[], cap: 4, mode: 'ffa' },
  { allowed: ['shotgun', 'sniper'] as WeaponId[], cap: 6, mode: 'tdm' },
  { allowed: ['rifle', 'smg'] as WeaponId[], cap: 8, mode: 'ffa' },
]) {
  test(`private ${scenario.allowed.join('+')} room enforces loadouts, gameplay and ${scenario.cap}-player occupancy`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    let peer: Room<unknown, RoomState> | undefined;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        'breakpoint.graphics.v2',
        JSON.stringify({
          preset: 'performance',
          adaptive: false,
          antiAliasing: 'off',
        }),
      ),
    );
    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
      await page.getByLabel('PLAYER NAME').fill('RestrictedHost');
      await page
        .getByRole('combobox', { name: 'GAME MODE', exact: true })
        .selectOption(scenario.mode);
      await page
        .getByRole('combobox', { name: 'PLAYER LIMIT', exact: true })
        .selectOption(String(scenario.cap));
      await page.getByLabel('Restrict weapons', { exact: true }).check();
      for (const id of scenario.allowed)
        await page
          .getByLabel(
            id === 'smg' ? 'SMG' : id[0]!.toUpperCase() + id.slice(1),
            { exact: true },
          )
          .check();
      await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
      const code = (await page.getByTestId('room-code').textContent())!;
      const occupancy = page.getByTestId('room-occupancy');
      await expect(occupancy).toHaveText(`1 / ${scenario.cap} PLAYERS`);
      await expect(page.getByTestId('room-rules')).toContainText(
        `WEAPONS: ${scenario.allowed.map((id) => id.toUpperCase()).join(' + ')}`,
      );
      const client = new Client('http://127.0.0.1:2567');
      const attach = async () => {
        peer = await client.joinById<RoomState>(code, {
          name: 'Observer',
          settings: { allowedWeapons: ['rifle'], playerLimit: 8 },
        });
        for (const type of ['correction', 'notice', 'shot', 'kill'])
          peer.onMessage(type, () => {});
        await expect
          .poll(() => peer?.state?.players?.has(peer.sessionId))
          .toBe(true);
        return peer;
      };
      await attach();
      await expect(occupancy).toHaveText(`2 / ${scenario.cap} PLAYERS`);
      expect([...peer!.state.allowedWeapons]).toEqual(scenario.allowed);
      expect(peer!.state.playerLimit).toBe(scenario.cap);
      if (scenario.cap === 2)
        await expect(
          client.joinById(code, { name: 'Overflow' }),
        ).rejects.toThrow();
      await page.screenshot({
        path: `test-results/bp09-${scenario.allowed.join('-')}-lobby.png`,
      });
      peer!.send('ready', true);
      await expect(
        page.getByRole('button', { name: 'START SESSION' }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'START SESSION' }).click();
      await enterStartedMatch(page);
      const hud = page.getByTestId('weapon-status');
      await expect(hud).toHaveAttribute('data-weapon', scenario.allowed[0]!);
      await expect(hud.locator('.weapon-keys')).toHaveText(
        scenario.allowed
          .map((id) => `${weaponOrder.indexOf(id) + 1} ${id.toUpperCase()}`)
          .join(' \u00b7 '),
      );
      for (let i = 0; i < weaponOrder.length; i++) {
        const id = weaponOrder[i]!,
          before = await hud.getAttribute('data-weapon');
        await page.keyboard.press(String(i + 1));
        if (scenario.allowed.includes(id))
          await expect(hud).toHaveAttribute('data-weapon', id);
        else {
          await page.waitForTimeout(300);
          await expect(hud).toHaveAttribute('data-weapon', before!);
        }
      }
      const selected = (await hud.getAttribute('data-weapon')) as WeaponId;
      await page.waitForTimeout(350);
      await page.mouse.down({ button: 'right' });
      await expect
        .poll(async () => Number(await hud.getAttribute('data-ads')))
        .toBeGreaterThan(0.95);
      await page.mouse.click(640, 360);
      await expect(hud).toHaveAttribute(
        'data-ammo',
        String(weaponConfigs[selected].magazine - 1),
      );
      await page.keyboard.press('r');
      await expect(hud).toHaveAttribute('data-reloading', 'true');
      await expect(hud).toHaveAttribute(
        'data-ammo',
        String(weaponConfigs[selected].magazine),
      );
      await page.mouse.up({ button: 'right' });
      await page.screenshot({
        path: `test-results/bp09-${scenario.allowed.join('-')}-game.png`,
      });
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', { name: 'ROOM LOBBY', exact: true })
        .click();
      await peer!.leave();
      peer = undefined;
      await expect(occupancy).toHaveText(`1 / ${scenario.cap} PLAYERS`);
      await attach();
      await expect(occupancy).toHaveText(`2 / ${scenario.cap} PLAYERS`);
      expect([...peer!.state.allowedWeapons]).toEqual(scenario.allowed);
      expect(peer!.state.players.get(peer!.sessionId)!.weapon).toBe(
        scenario.allowed[0],
      );
      expect(errors).toEqual([]);
    } finally {
      await peer?.leave();
    }
  });
}
