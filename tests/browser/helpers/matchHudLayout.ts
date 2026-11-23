import { expect, type Page } from '@playwright/test';

export async function expectMatchHudLayout(page: Page, touch = false) {
  const hud = page.locator('.multiplayer-hud');
  const selectors = [
    '.top-bar',
    '.match-status',
    '.telemetry',
    '.player-health',
    '.match-map',
    '.combat-hud',
  ];
  for (const selector of selectors)
    await expect(hud.locator(selector)).toBeVisible();
  const boxes = await hud.locator(selectors.join(',')).evaluateAll((panels) =>
    panels.map((panel) => ({
      name: panel.className,
      ...(panel.getBoundingClientRect().toJSON() as {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
      }),
    })),
  );
  const { width, height } = page.viewportSize()!;
  const aimingArea = {
    left: width / 2 - 20,
    right: width / 2 + 20,
    top: height / 2 - 20,
    bottom: height / 2 + 20,
  };
  type Bounds = typeof aimingArea;
  const overlaps = (a: Bounds, b: Bounds) =>
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;
  for (const [index, box] of boxes.entries()) {
    expect(box.left, box.name).toBeGreaterThanOrEqual(0);
    expect(box.top, box.name).toBeGreaterThanOrEqual(0);
    expect(box.right, box.name).toBeLessThanOrEqual(width);
    expect(box.bottom, box.name).toBeLessThanOrEqual(height);
    expect(
      overlaps(box, aimingArea),
      `${box.name} covers the aiming area`,
    ).toBe(false);
    for (const other of boxes.slice(index + 1))
      expect(overlaps(box, other), `${box.name} overlaps ${other.name}`).toBe(
        false,
      );
  }
  const score = boxes.find((panel) => panel.name === 'match-status')!;
  expect(score.left + score.width / 2).toBeCloseTo(width / 2, 0);
  if (!touch) return;
  const controls = await hud
    .locator('[data-hud-id]:visible')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const { left, right, top, bottom } = button.getBoundingClientRect();
        return {
          name: button.getAttribute('aria-label'),
          left,
          right,
          top,
          bottom,
        };
      }),
    );
  expect(controls).toHaveLength(11);
  for (const control of controls)
    for (const panel of boxes)
      expect(
        overlaps(control, panel),
        `${control.name} overlaps ${panel.name}`,
      ).toBe(false);
}
