/** Cosmetic ADS staging shared by the weapon and native scope overlay. */
function smoothRange(value: number, start: number, end: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function sniperRaise(ads: number): number {
  return smoothRange(ads, 0, 0.72);
}

export function sniperEyePosition(
  ads: number,
  eye = -0.192 - 0.11 / (2 * 0.86 * Math.tan(Math.PI / 6)),
): number {
  return -0.65 + (eye + 0.65) * smoothRange(ads, 0.35, 1);
}

export function sniperScopeBlend(ads: number): number {
  // Let the rifle reach the eye before handing over to the magnified sight.
  return smoothRange(ads, 0.67, 0.79);
}

export function sniperZoom(ads: number): number {
  return smoothRange(ads, 0.45, 0.96);
}

export function sniperScopeDiameter(ads: number): number {
  // Match the hollow tube's visible opening while the solid rifle is present,
  // then open the sight as the eye reaches the eyepiece. No transparent gun fade.
  const distance = -(sniperEyePosition(ads) - 0.25);
  const bore = (100 * 0.066) / (2 * distance * Math.tan(Math.PI / 6));
  return bore + (86 - bore) * smoothRange(ads, 0.79, 0.96);
}
