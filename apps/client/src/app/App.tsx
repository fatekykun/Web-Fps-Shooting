import { useEffect, useRef, useState } from 'react';
import type { Game, GameTelemetry } from '../game/core/Game';
import { Telemetry } from '../components/Telemetry';
import { GraphicsControls } from '../components/GraphicsControls';
import { CombatHud } from '../components/CombatHud';
import { RoomPanel } from '../components/RoomPanel';
import { MatchHud } from '../components/MatchHud';
import { CommandMenu } from '../components/CommandMenu';
import { PlayPanel, CreditsPanel } from '../components/CommandPanels';
import { SettingsPanel, crosshairStyle } from '../components/SettingsPanel';
import {
  defaultUserSettings,
  keyLabel,
  loadUserSettings,
  normalizeUserSettings,
  saveUserSettings,
  type UserSettings,
} from '../game/settings/userSettings';
import type { RoomView } from '@breakpoint/shared/network';
import { readInviteCode } from '../game/networking/invites';
import type { CombatSnapshot } from '../game/combat/PracticeCombat';
import {
  loadGraphicsSettings,
  saveGraphicsSettings,
  type GraphicsSettings,
  defaultGraphics,
  normalizeGraphicsSettings,
} from '../game/rendering/graphicsConfig';

export function App() {
  const viewport = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [entered, setEntered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GameTelemetry | null>(null);
  const [graphics, setGraphics] = useState(loadGraphicsSettings);
  const graphicsRef = useRef(graphics);
  const [combat, setCombat] = useState<CombatSnapshot | null>(null);
  const reticle = useRef<HTMLDivElement>(null);
  const reticleValues = useRef({ gap: -1, ads: -1 });
  const [room, setRoom] = useState<RoomView | null>(null);
  const [inviteCode] = useState(() => readInviteCode(location.href));
  const [roomsOpen, setRoomsOpen] = useState(Boolean(inviteCode));
  const roomSignature = useRef('');
  const [showScores, setShowScores] = useState(false);
  const [preferences, setPreferences] = useState(loadUserSettings);
  const preferencesRef = useRef(preferences);
  const [saved, setSaved] = useState(true);
  const [overlay, setOverlay] = useState<
    'play' | 'settings' | 'credits' | null
  >(null);
  const [roomTab, setRoomTab] = useState<'create' | 'join'>(
    inviteCode ? 'join' : 'create',
  );
  const connectAttempt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let instance: Game | null = null;
    const host = viewport.current!;
    const callbacks = {
      onLockChange: (value: boolean) => {
        if (cancelled) return;
        setLocked(value);
        reticleValues.current.gap = -1;
        reticleValues.current.ads = -1;
        if (value) {
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
        if (!cancelled) setCombat(value);
      },
      onScoreboard: (open: boolean) => {
        if (!cancelled) setShowScores(open);
      },
      onRoom: (view: RoomView | null) => {
        if (cancelled) return;
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
      onReticle: (gap: number, ads: number) => {
        if (cancelled || !reticle.current) return;
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
  function openPanel(panel: 'play' | 'settings' | 'credits'): void {
    setRoomsOpen(false);
    setOverlay(panel);
  }
  function enter(): void {
    setOverlay(null);
    setError(null);
    game.current?.enter();
  }

  return (
    <main
      className={`game-shell command-interface ${locked ? 'is-playing' : ''} ${preferences.reducedMotion ? 'motion-reduced' : ''} ${preferences.diagnostics ? '' : 'diagnostics-compact'}`}
      onPointerDown={() => game.current?.unlockAudio()}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button:not([data-silent])'))
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
            if (document.pointerLockElement) document.exitPointerLock();
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
            ? `${room.code} / ${room.players.length} OF 8`
            : locked
              ? 'TRAINING ACTIVE'
              : 'LOCAL TRAINING'}
          <span className="session-separator">/</span>PRIVATE COMMS
          {!locked && (
            <button
              className="audio-toggle"
              aria-label={preferences.muted ? 'Unmute audio' : 'Mute audio'}
              aria-pressed={preferences.muted}
              onClick={() =>
                changePreferences({ ...preferences, muted: !preferences.muted })
              }
            >
              {preferences.muted ? 'AUDIO OFF' : 'AUDIO ON'}
            </button>
          )}
          {!locked && (
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

      <Telemetry stats={stats} />
      {!locked && room?.phase !== 'results' && !overlay && !roomsOpen && (
        <GraphicsControls settings={graphics} onChange={changeGraphics} />
      )}

      {!locked && room?.phase !== 'results' && (
        <CommandMenu
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
          onLobby={() => openRooms()}
          onLeave={() => game.current?.leaveRoom()}
        />
      )}

      {roomsOpen && (
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
      {overlay === 'play' && (
        <PlayPanel
          ready={ready}
          onClose={() => setOverlay(null)}
          onTraining={enter}
          onCreate={() => openRooms('create')}
          onJoin={() => openRooms('join')}
        />
      )}
      {overlay === 'credits' && (
        <CreditsPanel onClose={() => setOverlay(null)} />
      )}
      {overlay === 'settings' && (
        <SettingsPanel
          settings={preferences}
          graphics={graphics}
          antiAliasing={stats?.antiAliasing}
          saved={saved}
          ready={ready}
          onChange={changePreferences}
          onGraphics={changeGraphics}
          onClose={() => setOverlay(null)}
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
          room={room}
          locked={locked}
          showScores={showScores}
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
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {locked && combat && (
        <CombatHud combat={combat} bindings={preferences.bindings} />
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
    </main>
  );
}
