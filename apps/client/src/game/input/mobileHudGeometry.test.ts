import { expect, it } from 'vitest';
import { resolveDefaultMobileHud, resolveMobileHud } from './mobileHudGeometry';
import {
  defaultMobileHudLayout,
  normalizeMobileHudLayout,
} from './mobileHudSettings';

const viewport = {
  width: 760,
  height: 304,
  safe: { left: 26, right: 8, top: 4, bottom: 6 },
  hudClearance: { top: 55, bottom: 66, feedHeight: 100 },
};
const anchors = resolveDefaultMobileHud(viewport, false);

it('places custom controls at the physical viewport edge with their full size', () => {
  const layout = defaultMobileHudLayout();
  layout.minimap = { ...layout.minimap, coordinates: 'viewport', x: 0, y: 0 };
  layout.fire = {
    ...layout.fire,
    coordinates: 'viewport',
    x: 1,
    y: 1,
    scale: 200,
  };
  const boxes = resolveMobileHud(layout, viewport, anchors);
  expect(boxes.minimap).toMatchObject({ x: 0, y: 0, scale: 1 });
  expect(boxes.fire).toMatchObject({ x: 760, y: 304, scale: 2 });
});

it('allows overlapping and leaves other anchors stationary when a control is resized', () => {
  const layout = defaultMobileHudLayout();
  layout.aim = { ...layout.aim, coordinates: 'viewport', x: 0.5, y: 0.5 };
  layout.fire = { ...layout.fire, coordinates: 'viewport', x: 0.5, y: 0.5 };
  const before = resolveMobileHud(layout, viewport, anchors);
  layout.fire.scale = 200;
  const after = resolveMobileHud(layout, viewport, anchors);
  expect(after.fire).toMatchObject({ x: 380, y: 152, scale: 2 });
  expect(after.aim).toEqual(before.aim);
  expect(after.aim).toMatchObject({ x: 380, y: 152 });
  expect(after.minimap).toEqual(before.minimap);
  expect(after.jump).toEqual(before.jump);
});

it('preserves safe-area placement for old layouts and range opacity for new layouts', () => {
  const layout = normalizeMobileHudLayout({
    minimap: { x: 0, y: 0, opacity: 50 },
    fire: { x: 1, y: 0, opacity: 63, coordinates: 'viewport' },
  });
  expect(layout.minimap.opacity).toBe(50);
  expect(layout.fire).toMatchObject({ opacity: 63, coordinates: 'viewport' });
  expect(normalizeMobileHudLayout(JSON.parse(JSON.stringify(layout)))).toEqual(
    layout,
  );
  const boxes = resolveMobileHud(layout, viewport, anchors);
  expect(boxes.minimap).toMatchObject({ x: 26, y: 4 });
  expect(boxes.fire).toMatchObject({ x: 760, y: 0 });
});
