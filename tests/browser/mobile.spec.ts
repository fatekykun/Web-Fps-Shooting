import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import type { RoomState } from '../../apps/server/src/rooms/RoomState';
import { expectMatchHudLayout } from './helpers/matchHudLayout';

const phone = {
  hasTouch: true,
  isMobile: true,
  viewport: { width: 844, height: 390 },
  screen: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
};
async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'breakpoint.graphics.v2',
      JSON.stringify({
        preset: 'performance',
        adaptive: false,
        antiAliasing: 'off',
      }),
    );
    // Exercise the fallback used by browsers that deny lock/fullscreen requests.
    Object.defineProperty(screen.orientation, 'lock', {
      configurable: true,
      value: () => Promise.reject(new Error('orientation denied')),
    });
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error('fullscreen denied'));
  });
}
async function point(page: Page, control: string) {
  const box = await page
    .locator(`[data-touch-control="${control}"]`)
    .boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
class Fingers {
  private readonly points = new Map<
    number,
    { id: number; x: number; y: number }
  >();
  constructor(private readonly cdp: CDPSession) {}
  async down(id: number, position: { x: number; y: number }) {
    this.points.set(id, { id, ...position });
    await this.send('touchStart');
  }
  async move(id: number, position: { x: number; y: number }) {
    this.points.set(id, { id, ...position });
    await this.send('touchMove');
  }
  async up(id: number) {
    this.points.delete(id);
    await this.send('touchEnd');
  }
  async cancel() {
    this.points.clear();
    await this.send('touchCancel');
  }
  private async send(
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  ) {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...this.points.values()],
    });
  }
}

test.describe('phone touch controls', () => {
  test.use(phone);
  test('HUD editor previews touch drag and opacity, discards a draft, and applies the saved layout after reload', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
    await page
      .getByRole('button', { name: /CONTROLLER SETTINGS \/ CUSTOMIZE/ })
      .tap();
    const controller = page.getByRole('dialog', {
      name: 'Controller Settings',
      exact: true,
    });
    await controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    const slider = page.getByRole('slider', { name: 'Button size' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveValue('200');
    await page.getByRole('button', { name: '30%', exact: true }).tap();
    const fire = page.getByRole('button', { name: 'Fire weapon' });
    await expect(fire).toHaveAttribute('data-selected', 'true');
    const before = await fire.boundingBox();
    const frame = await page.locator('.hud-editor-screen').boundingBox();
    const fingers = new Fingers(await context.newCDPSession(page));
    await fingers.down(1, await point(page, 'fire'));
    await fingers.move(1, {
      x: frame!.x + frame!.width * 0.3,
      y: frame!.y + frame!.height * 0.2,
    });
    await fingers.up(1);
    expect((await fire.boundingBox())!.x).toBeLessThan(before!.x - 40);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('dialog', { name: 'ROTATE YOUR DEVICE' }),
    ).toBeVisible();
    await page.setViewportSize(phone.viewport);
    await expect(
      page.getByRole('dialog', { name: 'ROTATE YOUR DEVICE' }),
    ).toBeHidden();
    await expect(slider).toHaveValue('200');
    await page.getByRole('button', { name: 'SAVE', exact: true }).tap();
    await expect(
      controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }),
    ).toBeVisible();
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('breakpoint.mobile-hud.v1')!).fire,
    );
    expect(saved).toMatchObject({ scale: 200, opacity: 30 });
    expect(saved.x).toBeCloseTo(0.3, 1);
    await controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    await page.getByRole('button', { name: 'RESET DEFAULT LAYOUT' }).tap();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'DISCARD CHANGES' }).tap();
    await controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    await expect(slider).toHaveValue('200');
    await page.getByRole('button', { name: 'DISCARD', exact: true }).tap();
    await page.reload();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    await expect(fire).toBeVisible();
    expect(
      await fire.evaluate((element) =>
        element.style.getPropertyValue('--hud-opacity'),
      ),
    ).toBe('30%');
    const ingame = await fire.boundingBox();
    expect(ingame!.width).toBeCloseTo(144);
    expect(ingame!.x + ingame!.width / 2).toBeCloseTo(saved.x * 844, 0);
    await fire.tap();
    await expect
      .poll(async () =>
        Number(
          await page.getByTestId('weapon-status').getAttribute('data-ammo'),
        ),
      )
      .toBeLessThan(30);
  });
  test('small phone landscape keeps every action reachable and portrait stays above an open room dialog', async ({
    page,
  }) => {
    await prepare(page);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Create a room' }).tap();
    await expect(page.getByLabel('PLAYER NAME')).toBeVisible();
    await page.setViewportSize({ width: 360, height: 640 });
    const rotate = page.getByRole('dialog', { name: 'ROTATE YOUR DEVICE' });
    await expect(rotate).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .elementFromPoint(innerWidth / 2, innerHeight / 2)
              ?.closest('dialog')?.className,
        ),
      )
      .toBe('orientation-overlay');
    await page.keyboard.press('Escape');
    await expect(rotate).toBeVisible();
    await page.setViewportSize({ width: 640, height: 360 });
    await expect(rotate).not.toBeVisible();
    await page.getByRole('button', { name: 'Close rooms' }).tap();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    await expect(page.locator('.mobile-hud')).toBeVisible();
    const boxes = await page.locator('.touch-button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.getAttribute('aria-label'),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        };
      }),
    );
    for (const box of boxes) {
      expect(box.width, box.name!).toBeGreaterThanOrEqual(44);
      expect(box.height, box.name!).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(640);
      expect(box.bottom).toBeLessThanOrEqual(360);
    }
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const x = boxes[a]!,
          y = boxes[b]!;
        expect(
          x.right <= y.x ||
            y.right <= x.x ||
            x.bottom <= y.y ||
            y.bottom <= x.y,
          `${x.name} overlaps ${y.name}`,
        ).toBe(true);
      }
    await page.screenshot({ path: 'test-results/bp13-small-phone.png' });
  });
  test('portrait blocks the lobby, landscape unlocks it, and real multitouch controls movement + ADS + fire + look', async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install();
    await prepare(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const rotate = page.getByRole('dialog', { name: 'ROTATE YOUR DEVICE' });
    await expect(rotate).toBeVisible();
    await page.screenshot({ path: 'test-results/bp13-portrait.png' });
    await rotate.getByRole('button', { name: 'ENABLE LANDSCAPE' }).tap();
    await expect(rotate).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(rotate).not.toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('data-device', 'phone');
    await page.screenshot({ path: 'test-results/bp13-phone-lobby.png' });
    await expect(
      page.getByRole('button', { name: 'ENTER TRAINING' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    await expect(page.locator('.mobile-hud.phone')).toBeVisible();
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const fingers = new Fingers(await context.newCDPSession(page));
    const joystick = await point(page, 'joystick');
    await fingers.down(1, joystick);
    await fingers.move(1, { x: joystick.x, y: joystick.y - 40 });
    await fingers.down(2, await point(page, 'aim'));
    await fingers.up(2);
    await fingers.down(3, await point(page, 'fire'));
    await fingers.down(4, { x: 470, y: 125 });
    await fingers.move(4, { x: 500, y: 135 });
    await page.clock.runFor(600);
    expect(
      Number(await page.getByTestId('speed').textContent()),
    ).toBeGreaterThan(1);
    const weapon = page.getByTestId('weapon-status');
    expect(Number(await weapon.getAttribute('data-ads'))).toBeGreaterThan(0.9);
    expect(Number(await weapon.getAttribute('data-ammo'))).toBeLessThan(30);
    await expect(
      page.getByRole('button', { name: 'Toggle ADS' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'test-results/bp13-phone-gameplay.png' });
    await fingers.cancel();
    const ammo = await weapon.getAttribute('data-ammo');
    await page.clock.runFor(700);
    await expect(weapon).toHaveAttribute('data-ammo', ammo!);
    expect(Number(await page.getByTestId('speed').textContent())).toBeLessThan(
      0.01,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rotate).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(rotate).not.toBeVisible();
    await expect(page.locator('.mobile-hud')).toHaveCount(0);
    await page.getByRole('button', { name: 'RESUME TRAINING' }).tap();
    await page.clock.runFor(300);
    await expect(
      page.getByRole('button', { name: 'Toggle ADS' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(weapon).toHaveAttribute('data-ammo', ammo!);
    await page.getByRole('button', { name: 'Pause game' }).tap();
    await expect(page.locator('.mobile-hud')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a mobile host automatically enters a multiplayer countdown and sends authoritative movement/fire', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.goto('/');
    await page
      .getByRole('button', { name: 'PRIVATE ROOMS', exact: true })
      .tap();
    await page.getByLabel('PLAYER NAME').fill('Touch host');
    await page.getByRole('button', { name: 'CREATE PRIVATE ROOM' }).tap();
    const guest = await new Client('http://127.0.0.1:2567').joinById<RoomState>(
      (await page.getByTestId('room-code').textContent())!,
      { name: 'Desktop guest' },
    );
    for (const type of ['shot', 'notice', 'kill', 'correction'])
      guest.onMessage(type, () => {});
    try {
      guest.send('ready', true);
      await page.getByRole('button', { name: 'START SESSION' }).tap();
      await expect(page.locator('.mobile-hud.phone')).toBeVisible();
      await expect(page.getByTestId('match-countdown')).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('match-status')).toHaveAttribute(
        'data-phase',
        'playing',
      );
      await expect(page.getByTestId('match-start-signal')).toBeHidden();
      await page.setViewportSize({ width: 640, height: 360 });
      await expect(page.getByText('TAP SCORES TO VIEW')).toBeVisible();
      await expectMatchHudLayout(page, true);
      await page.screenshot({ path: 'test-results/bp15-phone-match-hud.png' });
      await page.setViewportSize({ width: 1180, height: 820 });
      await expect(page.locator('.mobile-hud.tablet')).toBeVisible();
      await expectMatchHudLayout(page, true);
      await page.screenshot({ path: 'test-results/bp15-tablet-match-hud.png' });
      await page.setViewportSize(phone.viewport);
      await expect(page.locator('.mobile-hud.phone')).toBeVisible();
      const host = () => guest.state.players.get(guest.state.hostId)!;
      const fingers = new Fingers(await context.newCDPSession(page));
      const joystick = await point(page, 'joystick');
      await page.getByRole('button', { name: 'Crouch or slide' }).tap();
      await expect.poll(() => host().movement).toBe('crouching');
      await page.getByRole('button', { name: 'Toggle prone' }).tap();
      await expect.poll(() => host().movement).toBe('prone');
      await expect.poll(() => host().proneBlend).toBeGreaterThan(0.9);
      const crawlStart = host().z;
      await fingers.down(9, joystick);
      await fingers.move(9, { x: joystick.x, y: joystick.y - 22 });
      await expect.poll(() => host().z).toBeLessThan(crawlStart - 0.15);
      await fingers.up(9);
      await page.getByRole('button', { name: 'Toggle prone' }).tap();
      await expect.poll(() => host().movement).toBe('walking');
      const start = host().z;
      await fingers.down(1, joystick);
      await fingers.move(1, { x: joystick.x, y: joystick.y - 40 });
      await fingers.down(2, await point(page, 'fire'));
      await expect.poll(() => host().z).toBeLessThan(start - 0.5);
      await expect
        .poll(async () =>
          Number(
            await page.getByTestId('weapon-status').getAttribute('data-ammo'),
          ),
        )
        .toBeLessThan(30);
      await page.waitForTimeout(1000);
      const metrics = await page.locator('.telemetry').evaluate((element) => ({
        fps: Number((element as HTMLElement).dataset.fps),
        frameMs: Number((element as HTMLElement).dataset.frameMs),
        cpuMs: Number((element as HTMLElement).dataset.cpuMs),
        draws: Number((element as HTMLElement).dataset.draws),
      }));
      await test.info().attach('mobile-emulation-performance', {
        body: JSON.stringify(metrics, null, 2),
        contentType: 'application/json',
      });
      console.log('BP-13 Chrome mobile emulation on host hardware:', metrics);
      await fingers.cancel();
      await page.getByRole('button', { name: 'Show scores' }).tap();
      await expect(
        page.getByRole('region', { name: 'Scoreboard' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Show scores' }).tap();
      await page.getByRole('button', { name: 'Pause game' }).tap();
      await expect(
        page.getByRole('button', { name: 'ENTER ROOM' }),
      ).toBeVisible();
    } finally {
      await guest.leave();
    }
  });
});

test.describe('tablet and hybrid layouts', () => {
  test('iPad desktop identity receives spaced tablet controls and can use sniper, reload, swap and touch settings', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...phone,
      viewport: { width: 1180, height: 820 },
      screen: { width: 820, height: 1180 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    });
    const page = await context.newPage();
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }),
    );
    try {
      await prepare(page);
      await page.goto('/');
      await expect(page.locator('main')).toHaveAttribute(
        'data-device',
        'tablet',
      );
      await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
      await expect(page.locator('.mobile-hud.tablet')).toBeVisible();
      expect((await page.locator('.touch-joystick').boundingBox())!.width).toBe(
        164,
      );
      await page.getByRole('button', { name: 'Switch weapon' }).tap();
      await expect(page.getByTestId('weapon-status')).toHaveAttribute(
        'data-weapon',
        'smg',
      );
      await page.getByRole('button', { name: 'Switch weapon' }).tap();
      await expect(page.getByTestId('weapon-status')).toHaveAttribute(
        'data-weapon',
        'shotgun',
      );
      await page.getByRole('button', { name: 'Switch weapon' }).tap();
      await expect(page.getByTestId('weapon-status')).toHaveAttribute(
        'data-weapon',
        'sniper',
      );
      await page.getByRole('button', { name: 'Toggle ADS' }).tap();
      await expect
        .poll(async () =>
          Number(
            await page.getByTestId('weapon-status').getAttribute('data-ads'),
          ),
        )
        .toBeGreaterThan(0.95);
      await page.screenshot({ path: 'test-results/bp13-tablet-sniper.png' });
      await page.getByRole('button', { name: 'Fire weapon' }).tap();
      await expect(page.getByTestId('weapon-status')).toHaveAttribute(
        'data-ammo',
        '4',
      );
      await page.getByRole('button', { name: 'Reload weapon' }).tap();
      await expect(page.getByTestId('weapon-status')).toHaveAttribute(
        'data-reloading',
        'true',
      );
      await page.getByRole('button', { name: 'Pause game' }).tap();
      await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
      await page.getByRole('tab', { name: /SENSITIVITY/ }).tap();
      const slider = page.getByRole('slider', { name: /Touch sniper/ });
      await slider.focus();
      await page.keyboard.press('End');
      await expect(slider).toHaveValue('300');
      await page.reload();
      await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
      await page.getByRole('tab', { name: /SENSITIVITY/ }).tap();
      await expect(slider).toHaveValue('300');
      await page.getByRole('button', { name: 'RESET TOUCH SENSITIVITY' }).tap();
      await expect(slider).toHaveValue('100');
    } finally {
      await context.close();
    }
  });

  test('touchscreen laptop defaults to mouse/keyboard, supports touch entry and returns to mouse capture', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 10 }),
    );
    await page.goto('/');
    await expect(page.locator('main')).toHaveAttribute('data-device', 'hybrid');
    await page.getByRole('button', { name: 'ENTER TRAINING' }).click();
    await expect(page.locator('.crosshair')).toBeVisible();
    expect(
      await page.evaluate(() => document.pointerLockElement?.tagName),
    ).toBe('CANVAS');
    await expect(page.locator('.mobile-hud')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // A real touch pointer on the resume button selects touch mode on hybrids.
    await page
      .getByRole('button', { name: 'RESUME TRAINING' })
      .dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true });
    await page
      .getByRole('button', { name: 'RESUME TRAINING' })
      .dispatchEvent('click');
    await expect(page.locator('.mobile-hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'RESUME TRAINING' }).click();
    await expect(page.locator('.mobile-hud')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.pointerLockElement?.tagName))
      .toBe('CANVAS');
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  });
});
