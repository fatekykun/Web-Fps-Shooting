import {
  graphicsPresets,
  presetOrder,
  isGraphicsPreset,
  normalizeGraphicsSettings,
  settingsForPreset,
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
      <h2>GRAPHICS</h2>
      <div className="graphics-preset">
        <label htmlFor={`${idPrefix}-graphics-preset`}>Resolution preset</label>
        <select
          id={`${idPrefix}-graphics-preset`}
          value={settings.preset}
          onChange={(event) => {
            if (isGraphicsPreset(event.target.value))
              onChange({
                ...settingsForPreset(event.target.value),
                adaptive: settings.adaptive,
              });
          }}
        >
          {presetOrder.map((preset) => (
            <option key={preset} value={preset}>
              {graphicsPresets[preset].label} · {graphicsPresets[preset].width}{' '}
              × {graphicsPresets[preset].height}
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
      </div>
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
                  ['low', 'Low · 512 px atlas'],
                  ['high', 'High · 1K atlas'],
                  ['hd', 'HD · 2K atlas'],
                ],
              ],
              [
                'Shadow quality',
                'shadowQuality',
                [
                  ['off', 'Off · fastest'],
                  ['low', 'Low · 1024 px'],
                  ['high', 'High · 2048 px'],
                  ['ultra', 'Ultra · 4096 px'],
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
                'Render scale',
                'renderScale',
                [
                  [1, '100% · full preset'],
                  [0.75, '75%'],
                  [0.5, '50%'],
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
              ? `Active anti-aliasing: ${antiAliasingLabels[antiAliasing.active]}`
              : 'SMAA and MSAA clean up edges. FXAA uses fewer GPU resources.'}
        </p>
      )}
      <p>
        {settings.adaptive
          ? 'Resolution adjusts under sustained load to target 60 FPS.'
          : 'Render resolution stays fixed during play.'}
      </p>
    </section>
  );
}
