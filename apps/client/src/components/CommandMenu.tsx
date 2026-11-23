import type { RoomView } from '@breakpoint/shared/network';
import { isMatchActive } from '@breakpoint/shared/match';
import { keyLabel, type UserSettings } from '../game/settings/userSettings';

export function CommandMenu({
  ready,
  entered,
  room,
  error,
  settings,
  onEnter,
  onPlay,
  onCreate,
  onJoin,
  onSettings,
  onCredits,
  onWeapons,
  onLobby,
  onLeave,
  touchControls = false,
}: {
  ready: boolean;
  entered: boolean;
  room: RoomView | null;
  error: string | null;
  settings: UserSettings;
  touchControls?: boolean;
  onEnter(): void;
  onPlay(): void;
  onCreate(): void;
  onJoin(): void;
  onSettings(): void;
  onCredits(): void;
  onWeapons(): void;
  onLobby(): void;
  onLeave(): void;
}) {
  const b = settings.bindings;
  return (
    <div className="command-menu">
      <nav className="command-nav" aria-label="Main menu">
        <div className="nav-heading">COMMAND / 01</div>
        <button className="nav-active" onClick={room ? onLobby : onPlay}>
          <span aria-hidden="true">01</span>
          {room ? 'LOBBY' : 'PLAY'}
          <i aria-hidden="true">↗</i>
        </button>
        {!room && (
          <>
            <button
              disabled={!ready}
              onClick={onCreate}
              aria-label="Create a room"
            >
              <span aria-hidden="true">02</span>CREATE ROOM
            </button>
            <button disabled={!ready} onClick={onJoin} aria-label="Join a room">
              <span aria-hidden="true">03</span>JOIN ROOM
            </button>
          </>
        )}
        <button onClick={onSettings}>
          <span aria-hidden="true">04</span>SETTINGS
        </button>
        <button onClick={onCredits}>
          <span aria-hidden="true">05</span>CREDITS
        </button>
        <button onClick={onWeapons}>
          <span aria-hidden="true">06</span>ARMORY
        </button>
        {room && (
          <button className="nav-danger" onClick={onLeave}>
            <span aria-hidden="true">↙</span>LEAVE ROOM
          </button>
        )}
        <div className="nav-footnote">
          THE DEPOT
          <br />
          <span>PRIVATE FREQUENCIES ONLY</span>
        </div>
      </nav>
      <section className="entry-panel" aria-labelledby="entry-title">
        <div className="eyebrow">
          <span />
          {room
            ? `${room.match.mode.toUpperCase()} / PRIVATE MATCH`
            : entered
              ? 'OPERATION PAUSED'
              : 'TACTICAL MOVEMENT / PRECISION GUNPLAY'}{' '}
          <span className="tag">{room ? 'ONLINE' : 'LOCAL'}</span>
        </div>
        <h1 id="entry-title">
          {entered ? (
            <>
              BACK IN.
              <br />
              <em>STAY SHARP.</em>
            </>
          ) : (
            <>
              MOVE FAST.
              <br />
              <em>STAY SHARP.</em>
            </>
          )}
        </h1>
        <p className="intro">
          {room
            ? `Frequency ${room.code}. Your match stays live while paused.`
            : entered
              ? 'Your position is saved. Pick up where you left off.'
              : 'Own the ground before you take the shot.'}
          <br />
          {room
            ? room.phase === 'lobby'
              ? 'Ready your squad in the lobby to begin.'
              : touchControls
                ? 'Tap to return to the fight.'
                : 'Capture your mouse and get back to the fight.'
            : 'A compact arena. A clean sightline. No wasted motion.'}
        </p>
        <button
          className="enter-button"
          disabled={!ready || (room !== null && !isMatchActive(room.phase))}
          onClick={onEnter}
        >
          <span>
            {!ready
              ? 'INITIALIZING ARENA'
              : room
                ? isMatchActive(room.phase)
                  ? 'ENTER ROOM'
                  : 'WAITING FOR HOST'
                : entered
                  ? 'RESUME TRAINING'
                  : 'ENTER TRAINING'}
          </span>
          <span aria-hidden="true">↗</span>
        </button>
        <p className="capture-note">
          {touchControls ? (
            'TOUCH TO PLAY · DRAG RIGHT SIDE TO LOOK · SPRINT / ADS TOGGLE'
          ) : (
            <>
              CLICK TO CAPTURE MOUSE <span>·</span> ESC TO RELEASE
            </>
          )}
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="controls-row">
          <div>
            <span className="keys">
              {[b.forward, b.left, b.backward, b.right].map((code) => (
                <kbd key={code}>{keyLabel(code)}</kbd>
              ))}
            </span>
            <span>MOVE</span>
          </div>
          <div>
            <span className="mouse-symbol" aria-hidden="true" />
            <span>LOOK / AIM</span>
          </div>
          <div>
            <kbd>ESC</kbd>
            <span>PAUSE</span>
          </div>
        </div>
        <p className="movement-hint">
          {keyLabel(b.sprint)} Sprint · {keyLabel(b.jump)} Hop / wall jump ·{' '}
          {keyLabel(b.slide)} Crouch / slide · {keyLabel(b.prone)} Prone ·{' '}
          {keyLabel(b.dive)} Dive
          <br />
          LMB Fire · RMB Aim · {keyLabel(b.reload)} Reload ·{' '}
          {keyLabel(b.scoreboard)} Scores
        </p>
      </section>
    </div>
  );
}
