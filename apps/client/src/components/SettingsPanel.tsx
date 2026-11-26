import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  bindingActions,
  bindingLabels,
  defaultUserSettings,
  isBindingCode,
  keyLabel,
  rebind,
  type BindingAction,
  type UserSettings,
} from '../game/settings/userSettings';
import type { GraphicsSettings } from '../game/rendering/graphicsConfig';
import type { AntiAliasingState } from '../game/rendering/antiAliasing';
import {
  hudOpacityOptions,
  type MobileHudControl,
} from '../game/input/mobileHudSettings';
import { gyroAvailable, type GyroAccess } from '../game/input/GyroInput';
import type { GyroMeasurement } from '../game/input/InputManager';
import type { GyroActivation } from '../game/input/gyroSensitivity';
import { GraphicsControls } from './GraphicsControls';
import { GyroDiagnosticsPanel } from './GyroDiagnosticsPanel';
import { TacticalDialog } from './TacticalDialog';

const tabs = [
  'CONTROLS',
  'SENSITIVITY',
  'DISPLAY',
  'AUDIO',
  'CROSSHAIR',
] as const;
type MinimapSettings = Pick<MobileHudControl, 'opacity' | 'visible'>;
const sensitivityLabels = {
  steering: 'Steering Sensitivity',
  ads: 'ADS Sensitivity',
  sniper: 'Sniper Scope Sensitivity',
  vertical: 'Vertical Turning Sensitivity',
} as const;
const gyroLabels = {
  steering: 'Steering Gyro Sensitivity',
  ads: 'Gyro ADS Sensitivity',
  sniper: 'Gyro Sniper Scope Sensitivity',
  vertical: 'Gyro Vertical Turning Sensitivity',
} as const;
const gyroModes = { off: 'Off', ads: 'ADS only', always: 'Always on' } as const;
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
  showGyro,
  onGyroActivation,
  gyroMeasurement,
  onStartGyroMeasurement,
  onGraphics,
  onReset,
  onClose,
  onPreview,
  onControllerSettings,
  minimap,
  onMinimapChange,
}: {
  settings: UserSettings;
  graphics: GraphicsSettings;
  antiAliasing?: AntiAliasingState;
  saved: boolean;
  ready: boolean;
  onChange(settings: UserSettings): void;
  showGyro: boolean;
  onGyroActivation(mode: GyroActivation): Promise<GyroAccess>;
  gyroMeasurement: GyroMeasurement | null;
  onStartGyroMeasurement(): void;
  onGraphics(settings: GraphicsSettings): void;
  onReset(): void;
  onClose(): void;
  onPreview(): Promise<boolean>;
  onControllerSettings?(): void;
  minimap: MinimapSettings;
  onMinimapChange(values: Partial<MinimapSettings>): void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('CONTROLS');
  const [listening, setListening] = useState<BindingAction | null>(null);
  const [notice, setNotice] = useState('');
  const [gyroPending, setGyroPending] = useState(false);
  const [gyroAccess, setGyroAccess] = useState<GyroAccess | null>(null);
  const canUseGyro = showGyro && gyroAvailable();
  const id = useId();
  const settingsPage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (settingsPage.current) settingsPage.current.scrollTop = 0;
  }, [tab]);
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
            <span className="settings-tab-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')} /{' '}
            </span>
            {name}
          </button>
        ))}
      </div>
      <div
        className="settings-page"
        ref={settingsPage}
        data-tab={tab}
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
      >
        {tab === 'CONTROLS' && (
          <>
            {onControllerSettings && (
              <button
                className="enter-button controller-settings-button"
                onClick={onControllerSettings}
              >
                CONTROLLER SETTINGS / CUSTOMIZE TOUCH HUD
              </button>
            )}
            <div className="setting-grid">
              <Range
                label="Field of view"
                value={settings.fov}
                min={65}
                max={110}
                display={`${settings.fov}°`}
                onChange={(fov) => change({ fov })}
              />
            </div>
            <div className="scope-style-setting">
              <label htmlFor={`${id}-sync-ads-fov`}>Sync ADS FOV</label>
              <select
                id={`${id}-sync-ads-fov`}
                aria-describedby={`${id}-sync-ads-fov-note`}
                value={settings.syncAdsFov ? 'on' : 'off'}
                onChange={(event) =>
                  change({ syncAdsFov: event.target.value === 'on' })
                }
              >
                <option value="off">OFF</option>
                <option value="on">ON</option>
              </select>
            </div>
            <p className="settings-note" id={`${id}-sync-ads-fov-note`}>
              Synchronizes aiming field of view with your configured camera FOV.
            </p>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.invertY}
                onChange={(event) => change({ invertY: event.target.checked })}
              />{' '}
              Invert vertical look (mouse and touch)
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
        {tab === 'SENSITIVITY' && (
          <>
            <p className="settings-note">
              100 is the default. Steering, ADS and sniper values control
              horizontal turning; vertical turning has its own value. Zoom
              scaling is retained. Hold LMB to use firing sensitivity; release
              to use camera sensitivity.
            </p>
            {(['camera', 'firing'] as const).map((group) => (
              <fieldset key={group} className="sensitivity-group">
                <legend>{group.toUpperCase()} SENSITIVITY</legend>
                <div className="setting-grid">
                  {(
                    Object.keys(
                      sensitivityLabels,
                    ) as (keyof typeof sensitivityLabels)[]
                  ).map((key) => (
                    <Range
                      key={key}
                      label={`${group === 'camera' ? 'Camera' : 'Firing'} ${sensitivityLabels[key]}`}
                      value={settings.sensitivity[group][key]}
                      min={1}
                      max={300}
                      display={String(settings.sensitivity[group][key])}
                      onChange={(value) =>
                        change({
                          sensitivity: {
                            ...settings.sensitivity,
                            [group]: {
                              ...settings.sensitivity[group],
                              [key]: value,
                            },
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </fieldset>
            ))}
            <button
              className="text-button"
              onClick={() =>
                change({
                  sensitivity: defaultUserSettings().sensitivity,
                })
              }
            >
              RESET SENSITIVITY
            </button>
            <fieldset className="sensitivity-group">
              <legend>TOUCH CAMERA</legend>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={settings.touchAimAssist}
                  aria-describedby={`${id}-touch-aim-assist-note`}
                  onChange={(event) =>
                    change({ touchAimAssist: event.target.checked })
                  }
                />{' '}
                Touch Aim Assist
              </label>
              <p className="settings-note" id={`${id}-touch-aim-assist-note`}>
                Slows touch aiming near visible targets on phones and tablets.
              </p>
              <p className="settings-note">
                Independent touchscreen turning. ADS and sniper values blend
                with zoom. Sprint and ADS buttons toggle; fire and jump are
                held.
              </p>
              <div className="setting-grid">
                {(['camera', 'ads', 'sniper'] as const).map((key) => (
                  <Range
                    key={key}
                    label={`Touch ${key === 'camera' ? 'general camera' : key === 'ads' ? 'ADS' : 'sniper'}`}
                    value={settings.touchSensitivity[key]}
                    min={1}
                    max={300}
                    display={String(settings.touchSensitivity[key])}
                    onChange={(value) =>
                      change({
                        touchSensitivity: {
                          ...settings.touchSensitivity,
                          [key]: value,
                        },
                      })
                    }
                  />
                ))}
              </div>
            </fieldset>
            <button
              className="text-button"
              onClick={() =>
                change({
                  touchSensitivity: defaultUserSettings().touchSensitivity,
                })
              }
            >
              RESET TOUCH SENSITIVITY
            </button>
            {showGyro && (
              <fieldset className="sensitivity-group">
                <legend>GYROSCOPE</legend>
                <div
                  className="gyro-activation"
                  role="group"
                  aria-label="Gyro aiming"
                >
                  {(Object.keys(gyroModes) as GyroActivation[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="room-button"
                      aria-pressed={settings.gyroActivation === mode}
                      disabled={gyroPending || (!canUseGyro && mode !== 'off')}
                      onClick={async () => {
                        setGyroPending(true);
                        setGyroAccess(null);
                        try {
                          setGyroAccess(await onGyroActivation(mode));
                        } finally {
                          setGyroPending(false);
                        }
                      }}
                    >
                      {gyroModes[mode]}
                    </button>
                  ))}
                </div>
                {canUseGyro && gyroAccess !== 'denied' ? (
                  <p className="settings-note">
                    Tilt your device to aim while using touch controls.
                  </p>
                ) : (
                  <p className="settings-note" role="status">
                    {gyroAccess === 'denied'
                      ? 'Allow motion sensor access in your browser to enable gyro aiming.'
                      : 'Gyro aiming requires a browser with motion sensors on a secure connection.'}
                  </p>
                )}
                <div className="setting-grid">
                  <label className="setting-toggle">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={settings.gyroInvertHorizontal}
                      onChange={({ target }) =>
                        change({ gyroInvertHorizontal: target.checked })
                      }
                    />
                    Invert Horizontal Gyroscope
                  </label>
                  <label className="setting-toggle">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={settings.gyroInvertVertical}
                      onChange={({ target }) =>
                        change({ gyroInvertVertical: target.checked })
                      }
                    />
                    Invert Vertical Gyroscope
                  </label>
                  {(Object.keys(gyroLabels) as (keyof typeof gyroLabels)[]).map(
                    (key) => (
                      <Range
                        key={key}
                        label={gyroLabels[key]}
                        value={settings.gyroSensitivity[key]}
                        min={1}
                        max={300}
                        display={String(settings.gyroSensitivity[key])}
                        onChange={(value) =>
                          change({
                            gyroSensitivity: {
                              ...settings.gyroSensitivity,
                              [key]: value,
                            },
                          })
                        }
                      />
                    ),
                  )}
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    change({
                      gyroSensitivity: defaultUserSettings().gyroSensitivity,
                    })
                  }
                >
                  RESET GYRO SENSITIVITY
                </button>
                <GyroDiagnosticsPanel
                  settings={settings}
                  ready={ready}
                  measurement={gyroMeasurement}
                  onChange={change}
                  onStart={onStartGyroMeasurement}
                />
              </fieldset>
            )}
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
              <label htmlFor={`${id}-elimination-quality`}>
                Elimination effect quality
              </label>
              <select
                id={`${id}-elimination-quality`}
                value={settings.eliminationQuality}
                onChange={({ target }) => {
                  const value = target.value;
                  if (value === 'low' || value === 'medium' || value === 'high')
                    change({ eliminationQuality: value });
                }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={minimap.visible}
                onChange={(event) =>
                  onMinimapChange({ visible: event.target.checked })
                }
              />{' '}
              Show minimap
            </label>
            <div className="scope-style-setting">
              <label htmlFor={`${id}-minimap-opacity`}>Minimap opacity</label>
              <select
                id={`${id}-minimap-opacity`}
                value={minimap.opacity}
                onChange={(event) =>
                  onMinimapChange({ opacity: Number(event.target.value) })
                }
              >
                {hudOpacityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}%
                  </option>
                ))}
              </select>
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
                  ['footstepVolume', 'Footstep volume'],
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
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.spatialFootsteps}
                onChange={(event) =>
                  change({ spatialFootsteps: event.target.checked })
                }
              />
              Spatial footsteps
            </label>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.footstepOcclusion}
                onChange={(event) =>
                  change({ footstepOcclusion: event.target.checked })
                }
              />
              Muffle footsteps through cover
            </label>
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
