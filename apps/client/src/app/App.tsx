import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sniperScopeBlend,
  sniperScopeDiameter,
} from '../game/weapons/SniperScope';
import type { Game, GameTelemetry } from '../game/core/Game';
import { Telemetry } from '../components/Telemetry';
import { GraphicsControls } from '../components/GraphicsControls';
import { CombatHud } from '../components/CombatHud';
import { RoomPanel } from '../components/RoomPanel';
import { MatchHud } from '../components/MatchHud';
import { LoadoutPanel } from '../components/LoadoutPanel';
import { CommandMenu } from '../components/CommandMenu';
import { WeaponPanel } from '../components/WeaponPanel';
import { PlayPanel, CreditsPanel } from '../components/CommandPanels';
import { SettingsPanel, crosshairStyle } from '../components/SettingsPanel';
import { MobileHUD } from '../components/MobileHUD';
import { MobileHudEditor } from '../components/MobileHudEditor';
import { ControllerSettings } from '../components/ControllerSettings';
import {
  OrientationOverlay,
  useDeviceCapabilities,
} from '../components/OrientationOverlay';
import {
  defaultUserSettings,
  keyLabel,
  loadUserSettings,
  normalizeUserSettings,
  saveUserSettings,
  type UserSettings,
} from '../game/settings/userSettings';
import type { RoomView } from '@breakpoint/shared/network';
import { isMatchActive, matchCountdownSeconds } from '@breakpoint/shared/match';
import { readInviteCode } from '../game/networking/invites';
import type { CombatSnapshot } from '../game/combat/PracticeCombat';
import {
  loadGraphicsSettings,
  saveGraphicsSettings,
  type GraphicsSettings,
  defaultGraphics,
  normalizeGraphicsSettings,
} from '../game/rendering/graphicsConfig';
import {
  loadMobileHudLayout,
  saveMobileHudLayout,
  type MobileHudLayout,
} from '../game/input/mobileHudSettings';

export function App() {
  const viewport = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const attachTouchControls = useCallback(
    (root: HTMLElement) => game.current?.attachTouchControls(root),
    [],
  );
  const device = useDeviceCapabilities();
  const [touchControls, setTouchControls] = useState(device.handheld);
  const touchControlsRef = useRef(touchControls);
  const portrait = device.handheld && !device.landscape;
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [entered, setEntered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GameTelemetry | null>(null);
  const [graphics, setGraphics] = useState(loadGraphicsSettings);
  const graphicsRef = useRef(graphics);
  const [combat, setCombat] = useState<CombatSnapshot | null>(null);
  const owner = combat?.player;
  const reticle = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const reticleValues = useRef({ gap: -1, ads: -1 });
  const [room, setRoom] = useState<RoomView | null>(null);
  const previousRoom = useRef<RoomView | null>(null);
  const [matchEntry, setMatchEntry] = useState(false);
  const [inviteCode] = useState(() => readInviteCode(location.href));
  const [roomsOpen, setRoomsOpen] = useState(Boolean(inviteCode));
  const roomSignature = useRef('');
  const [showScores, setShowScores] = useState(false);
  const [preferences, setPreferences] = useState(loadUserSettings);
  const [mobileLayout, setMobileLayout] =
    useState<MobileHudLayout>(loadMobileHudLayout);
  const [controllerSettings, setControllerSettings] = useState(false);
  const [hudEditor, setHudEditor] = useState<{
    imported?: MobileHudLayout;
  } | null>(null);
  const [hudStorageUnavailable, setHudStorageUnavailable] = useState(false);
  const preferencesRef = useRef(preferences);
  const [saved, setSaved] = useState(true);
  const [overlay, setOverlay] = useState<
    'play' | 'settings' | 'credits' | 'weapons' | null
  >(null);
  const [roomTab, setRoomTab] = useState<'create' | 'join'>(
    inviteCode ? 'join' : 'create',
  );
  const connectAttempt = useRef(0);
  const preMatch = room?.phase === 'countdown';
  const respawning = room?.phase === 'playing' && owner?.alive === false;
  const choosingLoadout = preMatch || respawning;
  const loadoutLife = preMatch
    ? room.players.find((player) => player.id === room.selfId)?.life
    : owner?.life;

  useEffect(() => {
    let cancelled = false;
    let instance: Game | null = null;
    let captured = false;
    const host = viewport.current!;
    const callbacks = {
      onLockChange: (value: boolean) => {
        if (cancelled) return;
        captured = value;
        setLocked(value);
        reticleValues.current.gap = -1;
        reticleValues.current.ads = -1;
        if (value) {
          setMatchEntry(false);
          setEntered(true);
          setError(null);
        }
      },
      onTelemetry: (value: GameTelemetry) => {
        if (!cancelled) {
          setStats(value);
          setCombat(value.combat);
        }
      },
      onError: (message: string) => {
        if (!cancelled) setError(message);
      },
      onCombat: (value: CombatSnapshot) => {
        if (cancelled) return;
        setCombat(value);
        if (
          captured &&
          !touchControlsRef.current &&
          previousRoom.current?.phase === 'playing' &&
          value.player?.alive === false
        ) {
          setMatchEntry(true);
          instance?.pause();
        }
      },
      onScoreboard: (open: boolean) => {
        if (!cancelled) setShowScores(open);
      },
      onRoom: (view: RoomView | null) => {
        if (cancelled) return;
        const previous = previousRoom.current;
        previousRoom.current = view;
        if (
          view &&
          isMatchActive(view.phase) &&
          (!isMatchActive(previous?.phase) ||
            !previous ||
            previous.code !== view.code ||
            previous.match.round !== view.match.round)
        ) {
          setRoomsOpen(false);
          setOverlay(null);
          setShowScores(false);
          setError(null);
          setMatchEntry(true);
        } else if (!isMatchActive(view?.phase)) setMatchEntry(false);
        // The roster changes on membership/ready/phase events, independently of 20 Hz transforms.
        const signature = view
          ? JSON.stringify([
              view.code,
              view.phase,
              view.hostId,
              view.match,
              view.players.map((player) => [
                player.id,
                player.name,
                player.ready,
                player.team,
              ]),
            ])
          : '';
        if (signature !== roomSignature.current) {
          roomSignature.current = signature;
          setRoom(view);
          if (!view || view.phase !== 'playing') setShowScores(false);
          if (view?.phase === 'results') {
            setRoomsOpen(false);
            setOverlay(null);
          }
        }
      },
      onReticle: (
        gap: number,
        ads: number,
        scoped: number,
        opticReticle: boolean,
      ) => {
        if (cancelled || !reticle.current) return;
        const opacity = sniperScopeBlend(scoped);
        if (scope.current) {
          scope.current.style.opacity = String(opacity);
          scope.current.style.setProperty(
            '--scope-diameter',
            `${sniperScopeDiameter(scoped).toFixed(2)}vmin`,
          );
          scope.current.style.setProperty(
            '--scope-detail',
            String(
              Math.max(0, Math.min(1, (sniperScopeDiameter(scoped) - 30) / 40)),
            ),
          );
        }
        reticle.current.style.visibility =
          opacity > 0.95 || (opticReticle && ads > 0.95) ? 'hidden' : 'visible';
        const crosshair = preferencesRef.current.crosshair;
        gap = crosshair.dynamic
          ? crosshair.gap + Math.max(0, gap - 5)
          : crosshair.gap;
        if (Math.abs(gap - reticleValues.current.gap) > 0.25) {
          reticle.current.style.setProperty('--reticle-gap', `${gap}px`);
          reticleValues.current.gap = gap;
        }
        if (Math.abs(ads - reticleValues.current.ads) > 0.02) {
          reticle.current.style.opacity = String(1 - ads * 0.65);
          reticleValues.current.ads = ads;
        }
      },
    };
    void import('../game/core/Game')
      .then(({ Game }) =>
        cancelled
          ? null
          : Game.create(
              host,
              callbacks,
              graphicsRef.current,
              preferencesRef.current,
            ),
      )
      .then((created) => {
        if (!created) return;
        if (cancelled) {
          created.dispose();
          return;
        }
        instance = created;
        game.current = created;
        created.useTouchControls(touchControlsRef.current);
        created.setGraphicsSettings(graphicsRef.current);
        created.setUserSettings(preferencesRef.current);
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to initialize the game.',
          );
      });
    return () => {
      cancelled = true;
      instance?.dispose();
      game.current = null;
    };
  }, []);

  // Run after React has removed the native modal, so the arena is no longer inert.
  // Background tabs keep the arena prompt until the player returns and clicks.
  useEffect(() => {
    if (
      matchEntry &&
      (!choosingLoadout || touchControls) &&
      ready &&
      !portrait &&
      !hudEditor &&
      !controllerSettings &&
      !document.hidden &&
      document.hasFocus()
    )
      game.current?.enter(true);
  }, [
    matchEntry,
    choosingLoadout,
    touchControls,
    ready,
    portrait,
    hudEditor,
    controllerSettings,
  ]);

  useEffect(() => {
    if (portrait) game.current?.pause();
  }, [portrait]);

  function changeGraphics(settings: GraphicsSettings): void {
    settings = normalizeGraphicsSettings(settings);
    graphicsRef.current = settings;
    setGraphics(settings);
    saveGraphicsSettings(settings);
    game.current?.setGraphicsSettings(settings);
  }
  function changePreferences(value: UserSettings): void {
    const settings = normalizeUserSettings(value);
    preferencesRef.current = settings;
    setPreferences(settings);
    setSaved(saveUserSettings(settings));
    game.current?.setUserSettings(settings);
    reticleValues.current = { gap: -1, ads: -1 };
  }
  function openRooms(tab: 'create' | 'join' = 'create'): void {
    setOverlay(null);
    setRoomTab(tab);
    setError(null);
    setRoomsOpen(true);
  }
  function openPanel(panel: 'play' | 'settings' | 'credits' | 'weapons'): void {
    setRoomsOpen(false);
    setOverlay(panel);
  }
  function enter(): void {
    if (portrait) return;
    setOverlay(null);
    setRoomsOpen(false);
    setError(null);
    game.current?.enter();
  }
  function saveMobileLayout(layout: MobileHudLayout): void {
    setMobileLayout(layout);
    setHudStorageUnavailable(!saveMobileHudLayout(layout));
    setHudEditor(null);
  }

  const inArena = locked || choosingLoadout;
  const multiplayerHud = inArena && room !== null && isMatchActive(room.phase);

  return (
    <>
      <main
        className={`game-shell command-interface ${touchControls ? 'mobile-controls' : ''} ${device.tablet ? 'tablet-controls' : ''} ${inArena ? 'is-playing' : ''} ${multiplayerHud ? 'multiplayer-hud' : ''} ${preferences.reducedMotion ? 'motion-reduced' : ''} ${preferences.diagnostics ? '' : 'diagnostics-compact'}`}
        data-device={device.kind}
        onPointerDown={(event) => {
          game.current?.unlockAudio();
          if (locked || !device.touch || controllerSettings) return;
          const touch = event.pointerType === 'touch';
          touchControlsRef.current = touch;
          game.current?.useTouchControls(touch);
        }}
        onClick={(event) => {
          // Keep the pressed menu button in place until its click completes.
          setTouchControls(touchControlsRef.current);
          if (
            (event.target as HTMLElement).closest('button:not([data-silent])')
          )
            game.current?.uiClick();
        }}
      >
        <div className="viewport" ref={viewport} />
        <div className="edge-shade" aria-hidden="true" />
        <header className="top-bar">
          <a
            className="wordmark"
            href="/"
            aria-label="BREAKPOINT home"
            onClick={(event) => {
              event.preventDefault();
              setOverlay(null);
              setRoomsOpen(false);
              game.current?.pause();
            }}
          >
            <span className="brand-icon" aria-hidden="true">
              ▰
            </span>{' '}
            BREAKPOINT<span className="version">/ 0.1</span>
          </a>
          <div className="session-label">
            <span className={`status-dot ${locked ? 'active' : ''}`} />
            {room
              ? `${room.code} / ${room.players.length} OF ${room.playerLimit ?? 8}`
              : locked
                ? 'TRAINING ACTIVE'
                : 'LOCAL TRAINING'}
            <span className="session-separator">/</span>
            <span className="match-comms">PRIVATE COMMS</span>
            {!inArena && (
              <button
                className="audio-toggle"
                aria-label={preferences.muted ? 'Unmute audio' : 'Mute audio'}
                aria-pressed={preferences.muted}
                onClick={() =>
                  changePreferences({
                    ...preferences,
                    muted: !preferences.muted,
                  })
                }
              >
                {preferences.muted ? 'AUDIO OFF' : 'AUDIO ON'}
              </button>
            )}
            {!inArena && (
              <button
                className="room-button"
                disabled={!ready}
                onClick={() => {
                  openRooms();
                }}
              >
                {room ? 'ROOM LOBBY' : 'PRIVATE ROOMS'}
              </button>
            )}
          </div>
        </header>

        <Telemetry stats={stats} multiplayer={multiplayerHud} />
        {!inArena &&
          !touchControls &&
          !matchEntry &&
          room?.phase !== 'results' &&
          !overlay &&
          !roomsOpen && (
            <GraphicsControls settings={graphics} onChange={changeGraphics} />
          )}

        {!inArena && !matchEntry && room?.phase !== 'results' && (
          <CommandMenu
            touchControls={touchControls}
            ready={ready}
            entered={entered}
            room={room}
            error={error}
            settings={preferences}
            onEnter={enter}
            onPlay={() => openPanel('play')}
            onCreate={() => openRooms('create')}
            onJoin={() => openRooms('join')}
            onSettings={() => openPanel('settings')}
            onCredits={() => openPanel('credits')}
            onWeapons={() => openPanel('weapons')}
            onLobby={() => openRooms()}
            onLeave={() => game.current?.leaveRoom()}
          />
        )}

        {matchEntry && !inArena && isMatchActive(room?.phase) && (
          <section className="match-entry" aria-label="Match ready">
            <div className="match-entry-card">
              <span className="eyebrow">SESSION STARTED</span>
              <h2>YOU'RE IN.</h2>
              <p>
                {touchControls
                  ? 'The match is ready. Tap to enter the arena.'
                  : 'The match is live. Click to capture your mouse and play.'}
              </p>
              <button className="enter-button" onClick={enter}>
                {touchControls ? 'TAP TO PLAY' : 'CLICK TO PLAY'}
              </button>
              <button
                className="room-button"
                onClick={() => setMatchEntry(false)}
              >
                BACK TO MENU
              </button>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </div>
          </section>
        )}

        {!choosingLoadout && roomsOpen && (
          <RoomPanel
            room={room}
            error={error}
            initialTab={roomTab}
            initialCode={inviteCode}
            ready={ready}
            onCancelConnect={() => {
              ++connectAttempt.current;
              game.current?.cancelRoomConnection();
            }}
            onConnect={async (mode, name, code, settings) => {
              if (portrait) return;
              const attempt = ++connectAttempt.current;
              setError(null);
              try {
                await game.current?.connectRoom(mode, name, code, settings);
              } catch (reason) {
                if (attempt === connectAttempt.current)
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : 'Unable to connect to room server.',
                  );
              }
            }}
            onReady={(value) => {
              setError(null);
              game.current?.setRoomReady(value);
            }}
            onStart={() => {
              if (portrait) return;
              setError(null);
              game.current?.startRoom();
            }}
            onLeave={() => {
              game.current?.leaveRoom();
              setError(null);
            }}
            onClose={() => setRoomsOpen(false)}
            onConfigure={(settings) => {
              setError(null);
              game.current?.configureRoom(settings);
            }}
            onTeam={(team) => {
              setError(null);
              game.current?.setTeam(team);
            }}
            onLobby={() => game.current?.returnToLobby()}
            onScores={() => {
              setRoomsOpen(false);
              setShowScores(true);
            }}
          />
        )}
        {!choosingLoadout && overlay === 'play' && (
          <PlayPanel
            ready={ready}
            onClose={() => setOverlay(null)}
            onTraining={enter}
            onCreate={() => openRooms('create')}
            onJoin={() => openRooms('join')}
          />
        )}
        {!choosingLoadout && overlay === 'credits' && (
          <CreditsPanel onClose={() => setOverlay(null)} />
        )}
        {!choosingLoadout && overlay === 'weapons' && (
          <WeaponPanel
            initialWeapon={combat?.weapon}
            allowedWeapons={room?.allowedWeapons}
            onClose={() => setOverlay(null)}
          />
        )}
        {!choosingLoadout && overlay === 'settings' && !controllerSettings && (
          <SettingsPanel
            settings={preferences}
            graphics={graphics}
            antiAliasing={stats?.antiAliasing}
            saved={saved}
            ready={ready}
            onChange={changePreferences}
            onGraphics={changeGraphics}
            onClose={() => setOverlay(null)}
            onControllerSettings={
              device.touch ? () => setControllerSettings(true) : undefined
            }
            onReset={() => {
              changePreferences(defaultUserSettings());
              changeGraphics({ ...defaultGraphics });
            }}
            onPreview={() =>
              game.current?.previewAudio() ?? Promise.resolve(false)
            }
          />
        )}
        {room && (
          <MatchHud
            touchControls={touchControls}
            room={room}
            locked={locked}
            choosingLoadout={choosingLoadout}
            showScores={showScores && !choosingLoadout}
            onScores={setShowScores}
            onLobby={() => game.current?.returnToLobby()}
            onLeave={() => game.current?.leaveRoom()}
            scoreKey={keyLabel(preferences.bindings.scoreboard)}
          />
        )}

        {locked && (
          <div
            className={`crosshair ${preferences.crosshair.dot ? '' : 'no-dot'}`}
            style={crosshairStyle(preferences)}
            ref={reticle}
            hidden={choosingLoadout}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
        {locked && (
          <div
            className="sniper-scope"
            ref={scope}
            data-testid="sniper-scope"
            data-style={preferences.scopeStyle}
            hidden={choosingLoadout}
            aria-hidden="true"
          >
            <div className="scope-lens">
              <i />
              <span>{combat?.scopeMagnification ?? 4}× / SR-04</span>
            </div>
          </div>
        )}
        {inArena && combat && (
          <CombatHud
            combat={combat}
            bindings={preferences.bindings}
            multiplayer={multiplayerHud}
          />
        )}
        {locked && touchControls && (
          <MobileHUD
            attach={attachTouchControls}
            tablet={device.tablet}
            layout={mobileLayout}
            multiplayer={multiplayerHud}
            movement={stats}
          />
        )}
        {choosingLoadout && room && (
          <LoadoutPanel
            respawning={respawning}
            seconds={
              respawning
                ? Math.max(1, Math.ceil(owner?.respawnIn ?? 0))
                : room.match.countdownSeconds || matchCountdownSeconds
            }
            allowedWeapons={room.allowedWeapons}
            selected={owner?.nextWeapon ?? owner?.selected}
            onEquip={(weapon) => {
              if (loadoutLife !== undefined)
                game.current?.selectLoadout({
                  weapon,
                  life: loadoutLife,
                  round: room.match.round,
                });
            }}
          />
        )}
        {!choosingLoadout && controllerSettings && !hudEditor && (
          <ControllerSettings
            layout={mobileLayout}
            storageUnavailable={hudStorageUnavailable}
            onClose={() => setControllerSettings(false)}
            onEdit={(imported) => setHudEditor({ imported })}
          />
        )}
        {!choosingLoadout && hudEditor && (
          <MobileHudEditor
            tablet={device.tablet}
            initial={mobileLayout}
            imported={hudEditor.imported}
            onSave={saveMobileLayout}
            onDiscard={() => setHudEditor(null)}
          />
        )}

        <footer className="bottom-bar">
          <div className="map-label">
            <span className="map-number">01</span>
            <div>
              <span className="eyebrow">
                {room
                  ? `${room.match.mode.toUpperCase()} / PRIVATE MATCH`
                  : 'TRAINING GROUND'}
              </span>
              <strong>THE DEPOT</strong>
            </div>
            <span className="map-divider" />
            <span className="map-description">
              INDUSTRIAL SECTOR
              <br />
              PRIVATE COMBAT / 001
            </span>
          </div>
          <div className="footer-right">
            {locked ? (
              <>
                <kbd>ESC</kbd> RELEASE MOUSE
              </>
            ) : (
              <>
                MOVE WITH INTENT. LEAVE NOTHING TO CHANCE.
                <span className="footer-square" />
              </>
            )}
          </div>
        </footer>
        {multiplayerHud && room && (
          <aside className="match-map" aria-label="Map and match">
            <span className="match-sector">01</span>
            <div>
              <strong>THE DEPOT</strong>
              <span>{room.match.mode.toUpperCase()} · INDUSTRIAL SECTOR</span>
            </div>
            {locked && !touchControls && (
              <span className="match-mouse-hint">
                <kbd>ESC</kbd> RELEASE MOUSE
              </span>
            )}
          </aside>
        )}
      </main>
      <OrientationOverlay blocked={portrait} />
    </>
  );
}
