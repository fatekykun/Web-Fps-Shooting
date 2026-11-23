export const mobileHudControlIds = [
  'joystick',
  'sprint',
  'fire',
  'aim',
  'jump',
  'slide',
  'prone',
  'dive',
  'reload',
  'swap',
  'scores',
  'pause',
] as const;
export type MobileHudControlId = (typeof mobileHudControlIds)[number];
export interface MobileHudControl {
  x: number | null;
  y: number | null;
  scale: number;
  opacity: number;
  visible: boolean;
}
export type MobileHudLayout = Record<MobileHudControlId, MobileHudControl>;
export const mobileHudLayoutKey = 'breakpoint.mobile-hud.v1';
export function defaultMobileHudLayout(): MobileHudLayout {
  // Null coordinates use the original phone/tablet edge anchors.
  return Object.fromEntries(
    mobileHudControlIds.map((id) => [
      id,
      { x: null, y: null, scale: 100, opacity: 100, visible: true },
    ]),
  ) as MobileHudLayout;
}
function number(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : null;
}
export function normalizeMobileHudLayout(value: unknown): MobileHudLayout {
  const src =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const result = defaultMobileHudLayout();
  for (const id of mobileHudControlIds) {
    const item = src[id];
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    result[id] = {
      x: number(v.x, 0, 1),
      y: number(v.y, 0, 1),
      scale: Math.round(number(v.scale, 50, 200) ?? 100),
      opacity:
        typeof v.opacity === 'number' && [30, 50, 70, 100].includes(v.opacity)
          ? v.opacity
          : 100,
      visible: id === 'pause' || v.visible !== false,
    };
  }
  return result;
}
export function loadMobileHudLayout(): MobileHudLayout {
  try {
    return normalizeMobileHudLayout(
      JSON.parse(localStorage.getItem(mobileHudLayoutKey) ?? 'null'),
    );
  } catch {
    return defaultMobileHudLayout();
  }
}
export function saveMobileHudLayout(layout: MobileHudLayout): boolean {
  try {
    localStorage.setItem(
      mobileHudLayoutKey,
      JSON.stringify(normalizeMobileHudLayout(layout)),
    );
    return true;
  } catch {
    return false;
  }
}
