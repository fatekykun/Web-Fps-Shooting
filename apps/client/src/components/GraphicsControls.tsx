import {
  graphicsPresets,
  presetOrder,
  isGraphicsPreset,
  type GraphicsSettings,
} from '../game/rendering/graphicsConfig';

export function GraphicsControls({
  settings,
  onChange,
  idPrefix = 'quick',
}: {
  settings: GraphicsSettings;
  onChange: (settings: GraphicsSettings) => void;
  idPrefix?: string;
}) {
  return (
    <section className="graphics-controls" aria-label="Graphics settings">
      <h2>
        GRAPHICS <span>SHARP PIXELS</span>
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
      <p>
        Adapts within your preset to favor steady frames.
        <br />
        HUD stays sharp at every resolution.
      </p>
    </section>
  );
}
