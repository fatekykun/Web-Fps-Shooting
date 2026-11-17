export const bindingActions = [
  'forward',
  'backward',
  'left',
  'right',
  'sprint',
  'jump',
  'slide',
  'dive',
  'reload',
  'rifle',
  'smg',
  'shotgun',
  'sniper',
  'scoreboard',
] as const;
export type BindingAction = (typeof bindingActions)[number];
export const bindingLabels: Record<BindingAction, string> = {
  forward: 'Move forward',
  backward: 'Move back',
  left: 'Strafe left',
  right: 'Strafe right',
  sprint: 'Sprint',
  jump: 'Jump / wall jump',
  slide: 'Slide / cancel',
  dive: 'Dive',
  reload: 'Reload',
  rifle: 'Equip rifle',
  smg: 'Equip SMG',
  shotgun: 'Equip shotgun',
  sniper: 'Equip sniper',
  scoreboard: 'Scoreboard',
};
export const defaultBindings: Readonly<Record<BindingAction, string>> =
  Object.freeze({
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    sprint: 'ShiftLeft',
    jump: 'Space',
    slide: 'KeyC',
    dive: 'KeyX',
    reload: 'KeyR',
    rifle: 'Digit1',
    smg: 'Digit2',
    shotgun: 'Digit3',
    sniper: 'Digit4',
    scoreboard: 'Tab',
  });
export type ScopeStyle = 'optic' | 'classic';
export interface SensitivityGroup {
  steering: number;
  ads: number;
  sniper: number;
  vertical: number;
}
export interface SensitivitySettings {
  camera: SensitivityGroup;
  firing: SensitivityGroup;
}
function defaultSensitivityGroup(): SensitivityGroup {
  return { steering: 100, ads: 100, sniper: 100, vertical: 100 };
}
export interface UserSettings {
  sensitivity: SensitivitySettings;
  fov: number;
  scopeStyle: ScopeStyle;
  autoReload: boolean;
  invertY: boolean;
  reducedMotion: boolean;
  diagnostics: boolean;
  muted: boolean;
  masterVolume: number;
  effectsVolume: number;
  interfaceVolume: number;
  ambientVolume: number;
  bindings: Record<BindingAction, string>;
  crosshair: {
    color: string;
    length: number;
    thickness: number;
    gap: number;
    dot: boolean;
    dynamic: boolean;
  };
}
export const userSettingsKey = 'breakpoint.settings.v1';
export function defaultUserSettings(): UserSettings {
  return {
    sensitivity: {
      camera: defaultSensitivityGroup(),
      firing: defaultSensitivityGroup(),
    },
    fov: 85,
    scopeStyle: 'classic',
    autoReload: true,
    invertY: false,
    reducedMotion:
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    diagnostics: false,
    muted: false,
    masterVolume: 0.55,
    effectsVolume: 0.7,
    interfaceVolume: 0.45,
    ambientVolume: 0.08,
    bindings: { ...defaultBindings },
    crosshair: {
      color: '#edf0e3',
      length: 5,
      thickness: 2,
      gap: 5,
      dot: true,
      dynamic: true,
    },
  };
}
export function isBindingCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Tab|CapsLock|Enter|Backspace|Semicolon|Quote|Comma|Period|Slash|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash)$/.test(
      value,
    )
  );
}
function number(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
function normalizeSensitivity(value: unknown): SensitivitySettings {
  // Migrate the old global multiplier into each independent percentage once.
  const legacy =
    typeof value === 'number' ? number(value, 1, 0.25, 3) * 100 : 100;
  const saved = object(value);
  const group = (value: unknown): SensitivityGroup => {
    const v = object(value);
    return {
      steering: Math.round(number(v.steering, legacy, 1, 300)),
      ads: Math.round(number(v.ads, legacy, 1, 300)),
      sniper: Math.round(number(v.sniper, legacy, 1, 300)),
      vertical: Math.round(number(v.vertical, legacy, 1, 300)),
    };
  };
  return { camera: group(saved.camera), firing: group(saved.firing) };
}
export function normalizeUserSettings(value: unknown): UserSettings {
  const d = defaultUserSettings(),
    v = object(value),
    c = object(v.crosshair),
    b = { ...object(v.bindings) };
  // Add the new action without resetting existing customized controls.
  if (b.sniper === undefined) {
    const available = [
      'Digit4',
      'Digit5',
      'Digit6',
      'Digit7',
      'Digit8',
      'Digit9',
      'Digit0',
      ...Array.from(
        { length: 26 },
        (_, index) => `Key${String.fromCharCode(65 + index)}`,
      ),
    ].find((code) => !Object.values(b).includes(code));
    if (available) b.sniper = available;
  }
  const bool = (key: string, fallback: boolean) =>
    typeof v[key] === 'boolean' ? (v[key] as boolean) : fallback;
  const validBindings =
    bindingActions.every((key) => isBindingCode(b[key])) &&
    new Set(bindingActions.map((key) => b[key])).size === bindingActions.length;
  return {
    sensitivity: normalizeSensitivity(v.sensitivity),
    fov: number(v.fov, d.fov, 65, 110),
    scopeStyle: v.scopeStyle === 'optic' ? 'optic' : 'classic',
    autoReload: bool('autoReload', d.autoReload),
    invertY: bool('invertY', d.invertY),
    reducedMotion: bool('reducedMotion', d.reducedMotion),
    diagnostics: bool('diagnostics', d.diagnostics),
    muted: bool('muted', d.muted),
    masterVolume: number(v.masterVolume, d.masterVolume, 0, 1),
    effectsVolume: number(v.effectsVolume, d.effectsVolume, 0, 1),
    interfaceVolume: number(v.interfaceVolume, d.interfaceVolume, 0, 1),
    ambientVolume: number(v.ambientVolume, d.ambientVolume, 0, 1),
    bindings: validBindings
      ? (Object.fromEntries(
          bindingActions.map((key) => [key, b[key]]),
        ) as UserSettings['bindings'])
      : d.bindings,
    crosshair: {
      color:
        typeof c.color === 'string' && /^#[\da-f]{6}$/i.test(c.color)
          ? c.color
          : d.crosshair.color,
      length: Math.round(number(c.length, d.crosshair.length, 2, 14)),
      thickness: Math.round(number(c.thickness, d.crosshair.thickness, 1, 4)),
      gap: Math.round(number(c.gap, d.crosshair.gap, 0, 16)),
      dot: typeof c.dot === 'boolean' ? c.dot : d.crosshair.dot,
      dynamic: typeof c.dynamic === 'boolean' ? c.dynamic : d.crosshair.dynamic,
    },
  };
}
export function loadUserSettings(): UserSettings {
  try {
    return normalizeUserSettings(
      JSON.parse(localStorage.getItem(userSettingsKey) ?? 'null'),
    );
  } catch {
    return defaultUserSettings();
  }
}
export function saveUserSettings(value: UserSettings): boolean {
  try {
    localStorage.setItem(
      userSettingsKey,
      JSON.stringify(normalizeUserSettings(value)),
    );
    return true;
  } catch {
    return false;
  }
}
/** Swapping bindings keeps every action assigned and prevents duplicate controls. */
export function rebind(
  settings: UserSettings,
  action: BindingAction,
  code: string,
): UserSettings {
  if (!isBindingCode(code)) return settings;
  const bindings = { ...settings.bindings };
  const other = bindingActions.find((key) => bindings[key] === code);
  if (other) bindings[other] = bindings[action];
  bindings[action] = code;
  return { ...settings, bindings };
}
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return (
    (
      {
        Space: 'SPACE',
        ShiftLeft: 'L SHIFT',
        ShiftRight: 'R SHIFT',
        ControlLeft: 'L CTRL',
        ControlRight: 'R CTRL',
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        CapsLock: 'CAPS',
        Tab: 'TAB',
      } as Record<string, string>
    )[code] ?? code.toUpperCase()
  );
}
