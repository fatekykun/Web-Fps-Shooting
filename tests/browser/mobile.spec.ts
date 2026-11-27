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

for (const device of ['phone', 'tablet'] as const) {
  test(`Touch Aim Assist slows a swipe near the training target on ${device} and saves OFF`, async ({
    browser,
  }) => {
    const tablet = device === 'tablet';
    const context = await browser.newContext(
      tablet
        ? {
            ...phone,
            viewport: { width: 1180, height: 820 },
            screen: { width: 820, height: 1180 },
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
          }
        : phone,
    );
    try {
      const page = await context.newPage();
      if (tablet)
        await page.addInitScript(() =>
          Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }),
        );
      await prepare(page);
      await page.goto('/');
      await expect(page.locator('main')).toHaveAttribute('data-device', device);
      const marker = page.getByTestId('minimap-player');
      const heading = () =>
        marker.evaluate((element) => {
          const transform = new DOMMatrix(getComputedStyle(element).transform);
          return Math.atan2(transform.b, transform.a);
        });
      const fingers = new Fingers(await context.newCDPSession(page));
      const turn = async () => {
        await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
        await expect(marker).toBeVisible();
        const before = await heading();
        const { width, height } = page.viewportSize()!;
        const start = {
          x: Math.round(width * 0.56),
          y: Math.round(height * 0.32),
        };
        await fingers.down(1, start);
        expect(await heading()).toBe(before);
        await fingers.move(1, { ...start, x: start.x + 20 });
        await fingers.up(1);
        await expect.poll(heading).not.toBe(before);
        return Math.abs((await heading()) - before);
      };
      const settings = async () => {
        await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
        await page.getByRole('tab', { name: /SENSITIVITY/ }).tap();
      };
      const assisted = await turn();
      await page.getByRole('button', { name: 'Pause game' }).tap();
      await settings();
      const toggle = page.getByRole('checkbox', { name: 'Touch Aim Assist' });
      await expect(toggle).toBeChecked();
      await toggle.uncheck();
      await page.reload();
      await settings();
      await expect(toggle).not.toBeChecked();
      await page.getByRole('button', { name: 'Close settings' }).tap();
      const unassisted = await turn();
      expect(assisted).toBeLessThan(unassisted * 0.85);
    } finally {
      await context.close();
    }
  });
}

test.describe('phone touch controls', () => {
  test.use(phone);
  test('Touch Aim Assist gently pulls toward the training target while aiming down sights', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    const marker = page.getByTestId('minimap-player');
    await expect(marker).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const heading = () =>
      marker.evaluate((element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return Math.atan2(matrix.b, matrix.a);
      });
    const center = await heading();
    const error = async () => {
      const offset = (await heading()) - center;
      return Math.abs(Math.atan2(Math.sin(offset), Math.cos(offset)));
    };
    const fingers = new Fingers(await context.newCDPSession(page));
    const start = { x: 472, y: 125 };
    await fingers.down(1, start);
    await fingers.move(1, { ...start, x: start.x + 9 });
    await fingers.up(1);
    await page.clock.runFor(250);
    const before = await error();
    expect(before).toBeGreaterThan(0.02);
    await fingers.down(2, await point(page, 'aim'));
    await fingers.up(2);
    await page.clock.runFor(650);
    expect(await error()).toBeLessThan(before - 0.006);
    await expect(page.getByTestId('weapon-status')).toHaveAttribute(
      'data-ammo',
      '30',
    );
  });
  test('dragging off Hip Fire turns the camera while the trigger stays held', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    const fire = page.getByRole('button', { name: 'Hip Fire' });
    await expect(fire).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const weapon = page.getByTestId('weapon-status');
    const heading = () =>
      page.getByTestId('minimap-player').evaluate((marker) => {
        const matrix = new DOMMatrix(getComputedStyle(marker).transform);
        return Math.atan2(matrix.b, matrix.a);
      });
    const initialHeading = await heading();
    const start = await point(page, 'fire');
    const fingers = new Fingers(await context.newCDPSession(page));
    await fingers.down(1, start);
    await fingers.move(1, { x: start.x - 100, y: start.y });
    await page.clock.runFor(540);
    const turn = (await heading()) - initialHeading;
    expect(
      Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))),
    ).toBeGreaterThan(0.25);
    expect(Number(await weapon.getAttribute('data-ammo'))).toBeLessThan(29);
    await expect(weapon).toHaveAttribute('data-ads', '0');
    const ammo = await weapon.getAttribute('data-ammo');
    await fingers.up(1);
    await page.clock.runFor(500);
    await expect(weapon).toHaveAttribute('data-ammo', ammo!);
  });
  test('the standalone ADS button holds aim until release in the saved Hold mode', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.clock.install();
    await page.goto('/');
    const settings = page.getByRole('button', {
      name: 'SETTINGS',
      exact: true,
    });
    await settings.tap();
    const mode = page.getByLabel('ADS button mode');
    await expect(mode).toHaveValue('tap');
    await mode.selectOption('hold');
    await page.reload();
    await settings.tap();
    await expect(mode).toHaveValue('hold');
    await page.getByRole('button', { name: 'Close settings' }).tap();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    const aim = page.getByRole('button', { name: 'Aim down sights' });
    await expect(aim).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const fingers = new Fingers(await context.newCDPSession(page));
    const weapon = page.getByTestId('weapon-status');
    await fingers.down(1, await point(page, 'aim'));
    await expect(aim).toHaveAttribute('aria-pressed', 'true');
    await page.clock.runFor(500);
    expect(Number(await weapon.getAttribute('data-ads'))).toBeGreaterThan(0.9);
    await fingers.up(1);
    await expect(aim).toHaveAttribute('aria-pressed', 'false');
    await page.clock.runFor(550);
    expect(Number(await weapon.getAttribute('data-ads'))).toBeLessThan(0.01);
  });
  for (const dragEnabled of [true, false]) {
    test(`ADS Fire aims and shoots with drag-to-aim ${dragEnabled ? 'on' : 'off'}`, async ({
      page,
      context,
    }) => {
      await prepare(page);
      await page.clock.install();
      await page.goto('/');
      await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
      const dragToggle = page.getByRole('switch', {
        name: 'ADS Fire Drag to Aim',
      });
      await expect(dragToggle).toBeChecked();
      if (dragEnabled) {
        await page.getByRole('button', { name: 'Close settings' }).tap();
      } else {
        await dragToggle.uncheck();
        await page.reload();
        await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
        await expect(dragToggle).not.toBeChecked();
        await page.getByRole('button', { name: 'Close settings' }).tap();
      }
      await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
      await expect(
        page.getByRole('button', { name: 'Hip Fire', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'ADS Fire', exact: true }),
      ).toBeVisible();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      const weapon = page.getByTestId('weapon-status');
      const marker = page.getByTestId('minimap-player');
      const heading = () =>
        marker.evaluate((element) => {
          const matrix = new DOMMatrix(getComputedStyle(element).transform);
          return Math.atan2(matrix.b, matrix.a);
        });
      const start = await point(page, 'adsFire');
      const initialHeading = await heading();
      const fingers = new Fingers(await context.newCDPSession(page));
      await fingers.down(1, start);
      await fingers.move(1, { x: start.x - 32, y: start.y });
      await page.clock.runFor(90);
      await expect(weapon).toHaveAttribute('data-ammo', '30');
      if (dragEnabled)
        expect(Math.abs((await heading()) - initialHeading)).toBeGreaterThan(
          0.02,
        );
      else expect(await heading()).toBeCloseTo(initialHeading, 4);
      await page.clock.runFor(460);
      expect(Number(await weapon.getAttribute('data-ads'))).toBeGreaterThan(
        0.9,
      );
      expect(Number(await weapon.getAttribute('data-ammo'))).toBeLessThan(30);
      await fingers.up(1);
      await page.clock.runFor(550);
      expect(Number(await weapon.getAttribute('data-ads'))).toBeLessThan(0.01);
      const ammo = Number(await weapon.getAttribute('data-ammo'));
      await page.getByRole('button', { name: 'ADS Fire', exact: true }).tap();
      await page.clock.runFor(700);
      await expect(weapon).toHaveAttribute('data-ammo', String(ammo - 1));
    });
  }
  test('HUD editor previews touch drag and opacity, discards a draft, and applies the saved layout after reload', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
    await page.getByRole('button', { name: 'CUSTOMIZE TOUCH HUD' }).tap();
    const controller = page.getByRole('dialog', {
      name: 'Controller Settings',
      exact: true,
    });
    await controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    const editor = page.getByRole('dialog', { name: 'HUD editor' });
    const screen = editor.locator('.hud-editor-screen');
    const adjustments = editor.getByRole('complementary', {
      name: 'Selected control settings',
    });
    const adjust = editor.getByRole('button', { name: 'Adjust', exact: true });
    const frame = (await screen.boundingBox())!;
    expect(frame).toEqual({ x: 0, y: 0, ...phone.viewport });
    const panel = (await adjustments.boundingBox())!;
    expect(panel.x + panel.width / 2).toBeCloseTo(frame.width / 2, 0);
    expect(panel.y + panel.height / 2).toBeCloseTo(frame.height / 2, 0);
    await expect(adjustments).toHaveCSS('opacity', '0.7');
    await expect(editor.locator('.hud-editor-bar')).toHaveCSS('opacity', '0.7');
    const fingers = new Fingers(await context.newCDPSession(page));
    const handle = (await editor
      .getByRole('button', { name: 'Move adjustments' })
      .boundingBox())!;
    await fingers.down(1, { x: handle.x + 10, y: handle.y + 10 });
    await fingers.move(1, { x: handle.x - 90, y: handle.y + 50 });
    await fingers.up(1);
    const movedPanel = (await adjustments.boundingBox())!;
    expect(movedPanel.x).toBeCloseTo(panel.x - 100, 0);
    expect(movedPanel.y).toBeCloseTo(panel.y + 40, 0);
    await adjust.tap();
    await expect(adjustments).toBeHidden();
    expect(await screen.boundingBox()).toEqual(frame);
    await adjust.tap();
    await expect(adjustments).toBeVisible();
    await page.setViewportSize({ width: 640, height: 280 });
    expect(await screen.boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 280,
    });
    await expect(adjustments).toBeInViewport({ ratio: 1 });
    await expect(
      editor.getByRole('button', { name: 'Save', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.setViewportSize(phone.viewport);
    const slider = page.getByRole('slider', { name: 'Button size' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveValue('200');
    await page.getByRole('slider', { name: 'Control opacity' }).fill('37');
    const fire = page.getByRole('button', { name: 'Hip Fire' });
    await expect(fire).toHaveAttribute('data-selected', 'true');
    await expect(fire.locator('svg[data-control-icon="fire"]')).toBeVisible();
    const before = await fire.boundingBox();
    await fingers.down(1, await point(page, 'fire'));
    await fingers.move(1, {
      x: frame.x + frame.width * 0.3,
      y: frame.y + frame.height * 0.2,
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
    expect(await screen.boundingBox()).toEqual(frame);
    await expect(slider).toHaveValue('200');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await save.press('Enter');
    await expect(
      controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }),
    ).toBeVisible();
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('breakpoint.mobile-hud.v1')!).fire,
    );
    expect(saved).toMatchObject({
      scale: 200,
      opacity: 37,
      coordinates: 'viewport',
    });
    expect(saved.x).toBeCloseTo(0.3, 1);
    await controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    await page.getByRole('button', { name: 'Reset default layout' }).tap();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'DISCARD CHANGES' }).tap();
    await controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    await expect(slider).toHaveValue('200');
    const mapEditor = page.getByRole('button', {
      name: 'Minimap',
      exact: true,
    });
    await mapEditor.tap();
    await expect(
      page.getByRole('combobox', { name: 'Selected control' }),
    ).toHaveValue('minimap');
    await page.getByRole('slider', { name: 'Control opacity' }).fill('63');
    await expect(page.getByTestId('minimap')).toHaveCSS('opacity', '0.63');
    await save.tap();
    await expect(
      controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }),
    ).toBeVisible();
    await controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    await expect(page.getByTestId('minimap')).toHaveCSS('opacity', '0.63');
    const mapBefore = (await mapEditor.boundingBox())!;
    const preview = (await page.locator('.hud-editor-screen').boundingBox())!;
    await fingers.down(1, {
      x: mapBefore.x + mapBefore.width / 2,
      y: mapBefore.y + mapBefore.height / 2,
    });
    await fingers.move(1, {
      x: preview.x + preview.width * 0.48,
      y: preview.y + preview.height * 0.24,
    });
    await fingers.up(1);
    expect((await mapEditor.boundingBox())!.x).toBeGreaterThan(
      mapBefore.x + 50,
    );
    await save.press('Enter');
    await expect(
      controller.getByRole('button', { name: 'EDIT HUD LAYOUT' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('breakpoint.mobile-hud.v1')!).minimap
            .opacity,
      ),
    ).toBe(63);
    await page.reload();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    await expect(fire).toBeVisible();
    const minimap = page.getByTestId('minimap');
    await expect(minimap).toHaveCSS('opacity', '0.63');
    const mapBox = (await minimap.boundingBox())!;
    expect(mapBox.x + mapBox.width / 2).toBeCloseTo(0.48 * 844, -1);
    const marker = page.getByTestId('minimap-player');
    const heading = () =>
      marker.evaluate(
        (element) => new DOMMatrix(getComputedStyle(element).transform).b,
      );
    const initialHeading = await heading();
    await fingers.down(1, {
      x: mapBox.x + mapBox.width / 2,
      y: mapBox.y + mapBox.height / 2,
    });
    await fingers.move(1, {
      x: mapBox.x + mapBox.width / 2 + 85,
      y: mapBox.y + mapBox.height / 2,
    });
    await fingers.up(1);
    await expect.poll(heading).toBeGreaterThan(initialHeading + 0.05);
    expect(
      await fire.evaluate((element) =>
        element.style.getPropertyValue('--hud-opacity'),
      ),
    ).toBe('37%');
    const ingame = await fire.boundingBox();
    expect(ingame!.width).toBeCloseTo(144);
    const resizedIcon = await fire.locator('svg').boundingBox();
    expect(resizedIcon!.width).toBeGreaterThan(60);
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
  test('custom HUD controls overlap, dock at the screen edges, and remain usable in training', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
    await page.getByRole('button', { name: 'CUSTOMIZE TOUCH HUD' }).tap();
    await page.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();

    const editor = page.getByRole('dialog', { name: 'HUD editor' });
    const fire = editor.getByRole('button', { name: 'Hip Fire' });
    const aim = editor.getByRole('button', { name: 'Aim down sights' });
    const map = editor.getByRole('button', { name: 'Minimap', exact: true });
    const center = async (item: typeof map) => {
      const box = (await item.boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const fingers = new Fingers(await context.newCDPSession(page));
    const drag = async (item: typeof map, target: { x: number; y: number }) => {
      await fingers.down(1, await center(item));
      await fingers.move(1, target);
      await fingers.up(1);
    };

    await drag(map, { x: -18, y: -12 });
    await expect.poll(() => center(map)).toEqual({ x: 0, y: 0 });
    await expect(map).toBeInViewport({ ratio: 0.24 });

    const aimBefore = (await aim.boundingBox())!;
    await drag(fire, await center(aim));
    await expect.poll(() => center(fire)).toEqual(await center(aim));
    await editor.getByRole('slider', { name: 'Button size' }).fill('200');
    expect(await aim.boundingBox()).toEqual(aimBefore);
    await expect.poll(() => center(fire)).toEqual(await center(aim));

    const edge = { x: phone.viewport.width, y: 214 };
    await drag(fire, { ...edge, x: edge.x + 20 });
    await expect.poll(() => center(fire)).toEqual(edge);
    await expect(fire).toBeInViewport({ ratio: 0.49 });
    await editor.getByRole('button', { name: 'Save', exact: true }).tap();
    await page.reload();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    const liveFire = page.getByRole('button', { name: 'Hip Fire' });
    await expect.poll(() => center(liveFire)).toEqual(edge);
    await expect
      .poll(() => center(page.getByTestId('minimap')))
      .toEqual({
        x: 0,
        y: 0,
      });
    await page.touchscreen.tap(edge.x - 15, edge.y);
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
    const controls = page.locator(
      '.mobile-hud :is(button[data-hud-id], [data-sprint-indicator])',
    );
    await expect(controls).toHaveCount(14);
    await expect(controls.locator('svg[data-control-icon]')).toHaveCount(14);
    for (const control of await controls.all())
      await expect(control).toHaveText('');
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
    await page.screenshot({ path: 'test-results/mobile-hud-icons-phone.png' });
    const stance = page.getByRole('button', { name: 'Crouch or slide' });
    await expect(stance.locator('svg')).toHaveAttribute(
      'data-control-icon',
      'crouch',
    );
    const fingers = new Fingers(await page.context().newCDPSession(page));
    const joystick = await point(page, 'joystick');
    const marker = page.getByRole('img', { name: 'Sprint indicator' });
    const trigger = (await marker.boundingBox())!;
    expect(trigger.y + trigger.height).toBeLessThan(joystick.y);
    await page.touchscreen.tap(
      trigger.x + trigger.width / 2,
      trigger.y + trigger.height / 2,
    );
    await expect(marker).not.toHaveAttribute('data-active', 'true');
    await fingers.down(1, joystick);
    await fingers.move(1, {
      x: joystick.x,
      y: trigger.y + trigger.height / 2 - 1,
    });
    await expect(marker).toHaveAttribute('data-active', 'true');
    await expect(stance.locator('svg')).toHaveAttribute(
      'data-control-icon',
      'slide',
    );
    await fingers.cancel();
    await expect(marker).toHaveAttribute('data-active', 'false');
  });
  test('the saved sprint marker controls walking and sprinting on one joystick drag', async ({
    page,
    context,
  }) => {
    await prepare(page);
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).tap();
    await page.getByRole('button', { name: 'CUSTOMIZE TOUCH HUD' }).tap();
    await page.getByRole('button', { name: 'EDIT HUD LAYOUT' }).tap();
    const editor = page.getByRole('dialog', { name: 'HUD editor' });
    const marker = editor.getByRole('button', { name: 'Sprint trigger' });
    await expect(marker).toBeVisible();
    const joystick = await point(page, 'joystick');
    const stockMarker = (await marker.boundingBox())!;
    const stockDistance = joystick.y - (stockMarker.y + stockMarker.height / 2);
    const customDistance = 38;
    expect(stockDistance).toBeGreaterThan(customDistance + 10);
    const fingers = new Fingers(await context.newCDPSession(page));
    await fingers.down(1, {
      x: stockMarker.x + stockMarker.width / 2,
      y: stockMarker.y + stockMarker.height / 2,
    });
    await fingers.move(1, { x: joystick.x, y: joystick.y - customDistance });
    await fingers.up(1);
    await editor
      .getByRole('button', { name: 'Save', exact: true })
      .press('Enter');
    await expect(editor).toBeHidden();
    await page.reload();
    await page.getByRole('button', { name: 'ENTER TRAINING' }).tap();
    await page.clock.pauseAt(new Date(Date.now() + 1000));

    const indicator = page.getByRole('img', { name: 'Sprint indicator' });
    const savedMarker = (await indicator.boundingBox())!;
    expect(joystick.y - (savedMarker.y + savedMarker.height / 2)).toBeCloseTo(
      customDistance,
      0,
    );
    const speed = page.getByTestId('speed');
    const state = page.getByTestId('movement-state');
    // Movement telemetry refreshes every 250 ms.
    const sampleMovement = () => page.clock.runFor(400);
    await fingers.down(1, joystick);
    await fingers.move(1, { x: joystick.x, y: joystick.y - 15 });
    await sampleMovement();
    await expect(state).toHaveText('WALKING');
    const walkSpeed = Number(await speed.textContent());
    expect(walkSpeed).toBeGreaterThan(4);
    await fingers.move(1, {
      x: joystick.x,
      y: joystick.y - customDistance - 4,
    });
    await expect(indicator).toHaveAttribute('data-active', 'true');
    await sampleMovement();
    await expect(state).toHaveText('SPRINTING');
    expect(Number(await speed.textContent())).toBeGreaterThan(walkSpeed);
    await fingers.move(1, { x: joystick.x, y: joystick.y - 10 });
    await expect(indicator).toHaveAttribute('data-active', 'false');
    await sampleMovement();
    await expect(state).toHaveText('WALKING');
    expect(Number(await speed.textContent())).toBe(walkSpeed);
    await fingers.up(1);
    await sampleMovement();
    await expect(speed).toHaveText('0.0');
    await expect(indicator).toHaveAttribute('data-active', 'false');
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
      page.getByRole('button', { name: 'Aim down sights' }),
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
      page.getByRole('button', { name: 'Aim down sights' }),
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
      const smg = page.getByRole('button', { name: 'Equip Loadout 2' });
      await smg.tap();
      await expect(smg).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: 'test-results/mobile-loadout.png' });
      await page.setViewportSize({ width: 1180, height: 820 });
      await expect(page.locator('.mobile-hud.tablet')).toBeVisible();
      const picker = page.getByRole('region', { name: 'CHOOSE YOUR LOADOUT' });
      await expect(picker.getByRole('button')).toHaveCount(4);
      expect(
        await picker.evaluate(
          (panel) => panel.scrollHeight === panel.clientHeight,
        ),
      ).toBe(true);
      await page.screenshot({ path: 'test-results/tablet-loadout.png' });
      await page.setViewportSize(phone.viewport);
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
      await expect.poll(() => host().weapon).toBe('smg');
      const fingers = new Fingers(await context.newCDPSession(page));
      const joystick = await point(page, 'joystick');
      const crouch = page.getByRole('button', { name: 'Crouch or slide' });
      await crouch.tap();
      await expect.poll(() => host().movement).toBe('crouching');
      await expect(crouch).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Toggle prone' }).tap();
      await expect.poll(() => host().movement).toBe('prone');
      await expect(
        page.getByRole('button', { name: 'Toggle prone' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => host().proneBlend).toBeGreaterThan(0.9);
      const crawlStart = host().z;
      await fingers.down(9, joystick);
      await fingers.move(9, { x: joystick.x, y: joystick.y - 22 });
      await expect.poll(() => host().z).toBeGreaterThan(crawlStart + 0.15);
      await fingers.up(9);
      await page.getByRole('button', { name: 'Toggle prone' }).tap();
      await expect.poll(() => host().movement).toBe('walking');
      const start = host().z;
      await fingers.down(1, joystick);
      await fingers.move(1, { x: joystick.x, y: joystick.y - 40 });
      await fingers.down(2, await point(page, 'adsFire'));
      await expect.poll(() => host().z).toBeGreaterThan(start + 0.5);
      const weapon = page.getByTestId('weapon-status');
      await expect
        .poll(async () => Number(await weapon.getAttribute('data-ads')))
        .toBeGreaterThan(0.9);
      await expect
        .poll(async () => Number(await weapon.getAttribute('data-ammo')))
        .toBeLessThan(35);
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
      await expect(page.getByTestId('minimap')).toBeVisible();
      expect((await page.getByTestId('minimap').boundingBox())!.width).toBe(
        138,
      );
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
      await page.getByRole('button', { name: 'Aim down sights' }).tap();
      await expect
        .poll(async () =>
          Number(
            await page.getByTestId('weapon-status').getAttribute('data-ads'),
          ),
        )
        .toBeGreaterThan(0.95);
      await page.screenshot({ path: 'test-results/bp13-tablet-sniper.png' });
      await page.getByRole('button', { name: 'Hip Fire' }).tap();
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
