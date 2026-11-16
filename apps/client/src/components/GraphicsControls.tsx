import {
  graphicsPresets,
  presetOrder,
  isGraphicsPreset,
  normalizeGraphicsSettings,
  type GraphicsSettings,
} from '../game/rendering/graphicsConfig';
import {
  antiAliasingModes,
  antiAliasingLabels,
  type AntiAliasingState,
} from '../game/rendering/antiAliasing';

export function GraphicsControls({
  settings,
  onChange,
  idPrefix = 'quick',
  advanced = false,
  antiAliasing,
}: {
  settings: GraphicsSettings;
  onChange: (settings: GraphicsSettings) => void;
  idPrefix?: string;
  advanced?: boolean;
  antiAliasing?: AntiAliasingState;
}) {
  return (
    <section className="graphics-controls" aria-label="Graphics settings">
      <h2>
        GRAPHICS <span>CRISP RETRO</span>
      </h2>
      <label htmlFor={`${idPrefix}-graphics-preset`}>Resolution preset</label>
      <select
        id={`${idPrefix}-graphics-preset`}
        value={settings.preset}
        onChange={(event) => {
          if (isGraphicsPreset(event.target.value))
            onChange({ ...settings, preset: event.target.value });
        }}
      >
        {presetOrder.map((preset) => (
          <option key={preset} value={preset}>
            {graphicsPresets[preset].label} · {graphicsPresets[preset].width} ×{' '}
            {graphicsPresets[preset].height}
          </option>
        ))}
      </select>
      <label className="adaptive-toggle">
        <input
          type="checkbox"
          checked={settings.adaptive}
          onChange={(event) =>
            onChange({ ...settings, adaptive: event.target.checked })
          }
        />{' '}
        Adaptive resolution
      </label>
      {advanced && (
        <div className="graphics-detail-grid">
          {(
            [
              [
                'Anti-aliasing',
                'antiAliasing',
                antiAliasingModes.map(
                  (mode) => [mode, antiAliasingLabels[mode]] as const,
                ),
              ],
              [
                'Texture detail',
                'textureQuality',
                [
                  ['low', 'Low · 16 px tiles'],
                  ['high', 'High · 32 px tiles'],
                ],
              ],
              [
                'Shadow quality',
                'shadowQuality',
                [
                  ['off', 'Off · fastest'],
                  ['low', 'Low'],
                  ['high', 'High'],
                ],
              ],
              [
                'View distance',
                'viewDistance',
                [
                  [40, 'Near · 40 m'],
                  [60, 'Standard · 60 m'],
                  [80, 'Far · 80 m'],
                ],
              ],
              [
                'Pixel effect',
                'renderScale',
                [
                  [1, 'Crisp · full preset'],
                  [0.75, 'Retro · 75% resolution'],
                  [0.5, 'Classic · 50% resolution'],
                ],
              ],
            ] as const
          ).map(([label, field, options]) => (
            <div key={field}>
              <label htmlFor={`${idPrefix}-${field}`}>{label}</label>
              <select
                id={`${idPrefix}-${field}`}
                value={settings[field]}
                onChange={(event) =>
                  onChange(
                    normalizeGraphicsSettings({
                      ...settings,
                      [field]:
                        field === 'viewDistance' || field === 'renderScale'
                          ? Number(event.target.value)
                          : event.target.value,
                    }),
                  )
                }
              >
                {options.map(([value, text]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={
                      field === 'antiAliasing' &&
                      (antiAliasing
                        ? !antiAliasing.supported.includes(
                            value as GraphicsSettings['antiAliasing'],
                          )
                        : value !== 'off')
                    }
                  >
                    {text}
                    {field === 'antiAliasing' &&
                      antiAliasing &&
                      !antiAliasing.supported.includes(
                        value as GraphicsSettings['antiAliasing'],
                      ) &&
                      ' · unavailable'}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
      {advanced && (
        <p role="status" data-testid="aa-status">
          {antiAliasing?.loading
            ? 'Loading SMAA…'
            : antiAliasing && antiAliasing.requested !== antiAliasing.active
              ? 'Selected anti-aliasing is unavailable on this device. Using OFF.'
              : 'OFF keeps the sharpest pixels. FXAA is softer; SMAA and MSAA favor cleaner edges.'}
        </p>
      )}
      <p>
        Adaptive resolution favors steady frames within your preset.
        <br />
        HUD stays sharp.{!advanced && ' More display options in Settings.'}
      </p>
    </section>
  );
}
