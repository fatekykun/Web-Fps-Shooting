import { Client } from '@colyseus/sdk';
import { expect, test } from '@playwright/test';
import { movementConfig } from '@breakpoint/shared';
import { defaultLoadouts } from '@breakpoint/shared/weapons/loadouts';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { enterStartedMatch } from './helpers/matchEntry';

test('saves different operators per slot and synchronizes the chosen character at spawn', async ({
  page,
}, testInfo) => {
  const shaderErrors: string[] = [];
  page.on('pageerror', (error) => shaderErrors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /WebGLProgram|THREE\./.test(message.text())
    )
      shaderErrors.push(message.text());
  });
  await page.addInitScript(() => {
    const draws = window as typeof window & { operatorDraws: number };
    draws.operatorDraws = 0;
    const prototype = WebGL2RenderingContext.prototype;
    const draw = prototype.drawElements;
    const skinned = new WeakMap<WebGLProgram, boolean>();
    prototype.drawElements = function (mode, count, type, offset) {
      if (
        count > 5000 &&
        this.canvas instanceof HTMLCanvasElement &&
        !this.canvas.dataset.testid
      ) {
        const program = this.getParameter(
          this.CURRENT_PROGRAM,
        ) as WebGLProgram | null;
        if (program) {
          if (!skinned.has(program))
            skinned.set(
              program,
              this.getUniformLocation(program, 'boneTexture') !== null,
            );
          if (skinned.get(program)) draws.operatorDraws++;
        }
      }
      draw.call(this, mode, count, type, offset);
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const open = page.getByRole('button', { name: 'LOADOUTS', exact: true });
  await open.click();
  const operator = page.getByLabel('Character', { exact: true });
  const save = page.getByRole('button', { name: 'Save Loadout' });
  const model = page.getByTestId('weapon-showcase');
  await operator.selectOption('ghost');
  await expect(model).toHaveAttribute('data-status', 'ready');
  await expect(model).toHaveAccessibleName('Ghost showcase');
  await page.screenshot({ path: testInfo.outputPath('ghost-preview.png') });
  await save.click();
  await page.getByRole('button', { name: /^Loadout 2/ }).click();
  await operator.selectOption('crimson-officer');
  await expect(model).toHaveAttribute('data-status', 'ready');
  await page.screenshot({ path: testInfo.outputPath('crimson-preview.png') });
  await save.click();
  await page.reload();
  await open.click();
  await expect(operator).toHaveValue('ghost');
  await page.getByRole('button', { name: /^Loadout 2/ }).click();
  await expect(operator).toHaveValue('crimson-officer');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'PRIVATE ROOMS' }).click();
  await page.getByLabel('PLAYER NAME').fill('Operator host');
  await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).click();
  const profile = defaultLoadouts();
  profile.slots[0].operator = 'ghost';
  const peer = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
    (await page.getByTestId('room-code').textContent())!,
    { name: 'Operator guest', profile },
  );
  for (const kind of ['shot', 'kill', 'correction', 'notice'])
    peer.onMessage(kind, () => {});
  try {
    peer.send('ready', true);
    await page.getByRole('button', { name: 'START SESSION' }).click();
    await expect(page.locator('.loadout-weapon[data-slot="2"]')).toContainText(
      'Crimson Officer',
    );
    await page.getByRole('button', { name: 'Equip Loadout 2' }).click();
    await expect.poll(() => peer.state.phase).toBe('playing');
    await expect
      .poll(() => peer.state.players.get(peer.state.hostId)?.operator)
      .toBe('crimson-officer');
    expect(peer.state.players.get(peer.sessionId)?.operator).toBe('ghost');
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-operator',
      'crimson-officer',
    );
    await enterStartedMatch(page);
    const self = peer.state.players.get(peer.state.hostId)!;
    const other = peer.state.players.get(peer.sessionId)!;
    const angle = Math.atan2(self.x - other.x, self.z - other.z) - self.yaw;
    await page.evaluate(
      (movementX) => {
        document.dispatchEvent(new MouseEvent('mousemove', { movementX }));
      },
      -Math.atan2(Math.sin(angle), Math.cos(angle)) /
        movementConfig.sensitivity,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { operatorDraws: number }).operatorDraws,
        ),
      )
      .toBeGreaterThan(0);
    expect(shaderErrors).toEqual([]);
  } finally {
    await peer.leave();
  }
});
