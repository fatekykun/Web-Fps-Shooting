import { useEffect, useId, useState, type CSSProperties } from 'react';
import {
  bindingActions,
  bindingLabels,
  isBindingCode,
  keyLabel,
  rebind,
  type BindingAction,
  type UserSettings,
} from '../game/settings/userSettings';
import type { GraphicsSettings } from '../game/rendering/graphicsConfig';
import type { AntiAliasingState } from '../game/rendering/antiAliasing';
import { GraphicsControls } from './GraphicsControls';
import { TacticalDialog } from './TacticalDialog';

const tabs = ['CONTROLS', 'DISPLAY', 'AUDIO', 'CROSSHAIR'] as const;
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange(value: number): void;
}) {
  const id = useId();
  return (
    <label className="setting-range" htmlFor={id}>
      <span>
        {label}
        <output htmlFor={id} aria-hidden="true">
          {display}
        </output>
      </span>
      <input
        type="range"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
export function crosshairStyle(settings: UserSettings): CSSProperties {
  return {
    '--crosshair-color': settings.crosshair.color,
    '--reticle-length': `${settings.crosshair.length}px`,
    '--reticle-thickness': `${settings.crosshair.thickness}px`,
    '--reticle-gap': `${settings.crosshair.gap}px`,
  } as CSSProperties;
}
export function SettingsPanel({
  settings,
  graphics,
  antiAliasing,
  saved,
  ready,
  onChange,
  onGraphics,
  onReset,
  onClose,
  onPreview,
}: {
  settings: UserSettings;
  graphics: GraphicsSettings;
  antiAliasing?: AntiAliasingState;
  saved: boolean;
  ready: boolean;
  onChange(settings: UserSettings): void;
  onGraphics(settings: GraphicsSettings): void;
  onReset(): void;
  onClose(): void;
  onPreview(): Promise<boolean>;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('CONTROLS');
  const [listening, setListening] = useState<BindingAction | null>(null);
  const [notice, setNotice] = useState('');
  const id = useId();
  useEffect(() => {
    if (!listening) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setListening(null);
        setNotice('Binding unchanged.');
        return;
      }
      if (!isBindingCode(event.code) || event.metaKey || event.altKey) {
        setNotice('That key is reserved. Choose another key.');
        return;
      }
      onChange(rebind(settings, listening, event.code));
      setNotice(
        `${bindingLabels[listening]} assigned to ${keyLabel(event.code)}. Conflicting bindings swap automatically.`,
      );
      setListening(null);
    };
    document.addEventListener('keydown', capture, true);
    return () => document.removeEventListener('keydown', capture, true);
  }, [listening, settings, onChange]);
  const change = (values: Partial<UserSettings>) =>
    onChange({ ...settings, ...values });
  const reticle = (values: Partial<UserSettings['crosshair']>) =>
    change({ crosshair: { ...settings.crosshair, ...values } });
  return (
    <TacticalDialog
      title="FIELD SETTINGS"
      eyebrow="PERSONAL LOADOUT / PREFERENCES"
      name="Settings"
      onClose={onClose}
      className="settings-panel"
      footer={
        <>
          <span className="save-status" role="status">
            {saved
              ? '● SAVED ON THIS BROWSER'
              : 'APPLIED · LOCAL STORAGE UNAVAILABLE'}
          </span>
          <button
            className="text-button"
            onClick={() => {
              onReset();
              setListening(null);
              setNotice('All settings restored to defaults.');
            }}
          >
            RESTORE DEFAULTS
          </button>
        </>
      }
    >
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings categories"
      >
        {tabs.map((name, index) => (
          <button
            key={name}
            role="tab"
            id={`${id}-${name}`}
            aria-controls={`${id}-panel`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => {
              setTab(name);
              setListening(null);
              setNotice('');
            }}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft')
                next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              setTab(tabs[next]!);
              setListening(null);
              document.getElementById(`${id}-${tabs[next]}`)?.focus();
            }}
          >
            {String(index + 1).padStart(2, '0')} / {name}
          </button>
        ))}
      </div>
      <div
        className="settings-page"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
      >
        {tab === 'CONTROLS' && (
          <>
            <div className="setting-grid">
              <Range
                label="Mouse sensitivity"
                value={settings.sensitivity}
                min={0.25}
                max={3}
                step={0.05}
                display={`${settings.sensitivity.toFixed(2)}×`}
                onChange={(sensitivity) => change({ sensitivity })}
              />
              <Range
                label="Field of view"
                value={settings.fov}
                min={65}
                max={110}
                display={`${settings.fov}°`}
                onChange={(fov) => change({ fov })}
              />
            </div>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.invertY}
                onChange={(event) => change({ invertY: event.target.checked })}
              />{' '}
              Invert vertical look
            </label>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.autoReload}
                onChange={(event) =>
                  change({ autoReload: event.target.checked })
                }
              />{' '}
              Auto Reload
            </label>
            <p className="settings-note">
              Reload empty magazines automatically when reserve ammo is
              available. R always reloads manually.
            </p>
            <div className="section-heading">
              <h3>KEYBOARD BINDINGS</h3>
              <span>MOUSE BUTTONS / ESC FIXED</span>
            </div>
            <div className="binding-grid">
              {bindingActions.map((action) => (
                <div
                  className={`binding-row ${listening === action ? 'listening' : ''}`}
                  key={action}
                >
                  <span>{bindingLabels[action]}</span>
                  <button
                    aria-label={`Rebind ${bindingLabels[action]}`}
                    onClick={() => {
                      setListening(action);
                      setNotice('Press a key. Esc cancels.');
                    }}
                  >
                    {listening === action
                      ? 'PRESS KEY…'
                      : keyLabel(settings.bindings[action])}
                  </button>
                </div>
              ))}
            </div>
            <p className="settings-note">
              LMB fires · Hold RMB to aim · Esc releases the mouse.
            </p>
          </>
        )}
        {tab === 'DISPLAY' && (
          <>
            <GraphicsControls
              settings={graphics}
              antiAliasing={antiAliasing}
              onChange={onGraphics}
              idPrefix="settings"
              advanced
            />
            <div className="section-heading">
              <h3>PRESENTATION</h3>
              <span>NATIVE HUD / PIXEL WORLD</span>
            </div>
            <div className="scope-style-setting">
              <label htmlFor={`${id}-scope-style`}>Sniper scope style</label>
              <select
                id={`${id}-scope-style`}
                value={settings.scopeStyle}
                onChange={(event) => {
                  const scopeStyle = event.target.value;
                  if (scopeStyle === 'optic' || scopeStyle === 'classic')
                    change({ scopeStyle });
                }}
              >
                <option value="optic">Optical / lens-only zoom</option>
                <option value="classic">
                  Classic / whole-view zoom (default)
                </option>
              </select>
            </div>
            <p className="settings-note">
              {settings.scopeStyle === 'optic'
                ? 'Only the lens magnifies the target. Surroundings stay at normal zoom.'
                : 'The lens and surrounding world zoom together, like a traditional sniper scope.'}
            </p>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(event) =>
                  change({ reducedMotion: event.target.checked })
                }
              />{' '}
              Reduced motion
            </label>
            <p className="settings-note">
              Reduces menu animation and cosmetic weapon bob. Weapon recoil and
              aiming remain accurate.
            </p>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.diagnostics}
                onChange={(event) =>
                  change({ diagnostics: event.target.checked })
                }
              />{' '}
              Detailed performance diagnostics
            </label>
            <p className="settings-note">
              FPS stays visible. Enable this for frame timing, rendering and
              movement readouts.
            </p>
          </>
        )}
        {tab === 'AUDIO' && (
          <>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.muted}
                onChange={(event) => change({ muted: event.target.checked })}
              />{' '}
              Mute all audio
            </label>
            <div className="setting-grid">
              {(
                [
                  ['masterVolume', 'Master volume'],
                  ['effectsVolume', 'Combat & movement'],
                  ['interfaceVolume', 'Interface volume'],
                  ['ambientVolume', 'Ambient volume'],
                ] as const
              ).map(([key, label]) => (
                <Range
                  key={key}
                  label={label}
                  value={settings[key]}
                  min={0}
                  max={1}
                  step={0.01}
                  display={`${Math.round(settings[key] * 100)}%`}
                  onChange={(value) => change({ [key]: value })}
                />
              ))}
            </div>
            <div className="audio-preview">
              <span className="audio-bars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <div>
                <h3>CHECK YOUR COMMS</h3>
                <p>Preview the current mix before deploying.</p>
              </div>
              <button
                className="room-button"
                data-silent="true"
                disabled={!ready || settings.muted}
                onClick={() => {
                  void onPreview().then((success) =>
                    setNotice(
                      success
                        ? 'AUDIO READY · Test tone played.'
                        : 'Audio is unavailable or blocked. Try again after unmuting.',
                    ),
                  );
                }}
              >
                PLAY TEST TONE
              </button>
            </div>
          </>
        )}
        {tab === 'CROSSHAIR' && (
          <>
            <div className="reticle-preview" aria-label="Crosshair preview">
              <span>RETICLE / LIVE PREVIEW</span>
              <div
                className={`crosshair ${settings.crosshair.dot ? '' : 'no-dot'}`}
                style={crosshairStyle(settings)}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="setting-grid">
              <label className="setting-color">
                Crosshair color
                <input
                  type="color"
                  value={settings.crosshair.color}
                  onChange={(event) => reticle({ color: event.target.value })}
                />
              </label>
              <Range
                label="Crosshair length"
                value={settings.crosshair.length}
                min={2}
                max={14}
                display={`${settings.crosshair.length} PX`}
                onChange={(length) => reticle({ length })}
              />
              <Range
                label="Crosshair thickness"
                value={settings.crosshair.thickness}
                min={1}
                max={4}
                display={`${settings.crosshair.thickness} PX`}
                onChange={(thickness) => reticle({ thickness })}
              />
              <Range
                label="Crosshair gap"
                value={settings.crosshair.gap}
                min={0}
                max={16}
                display={`${settings.crosshair.gap} PX`}
                onChange={(gap) => reticle({ gap })}
              />
            </div>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.crosshair.dot}
                onChange={(event) => reticle({ dot: event.target.checked })}
              />{' '}
              Center dot
            </label>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.crosshair.dynamic}
                onChange={(event) => reticle({ dynamic: event.target.checked })}
              />{' '}
              Dynamic spread indicator
            </label>
          </>
        )}
        {notice && (
          <p className="settings-feedback" role="status">
            {notice}
          </p>
        )}
      </div>
    </TacticalDialog>
  );
}
