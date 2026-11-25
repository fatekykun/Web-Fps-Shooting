import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@breakpoint/shared/network';
import { arenas, defaultMultiplayerMapId } from '@breakpoint/shared/maps';
import {
  matchDefaults,
  parsePrivateRoomSettings,
  type MatchSettings,
  type PrivateRoomSettings,
  type Team,
} from '@breakpoint/shared/match';
import { LobbySettings, MatchFields } from './MatchSettings';
import { roomInviteUrl } from '../game/networking/invites';
import { PrivateRoomFields } from './PrivateRoomFields';

interface Props {
  room: RoomView | null;
  error: string | null;
  onConnect(
    mode: 'create' | 'join',
    name: string,
    code: string,
    settings: PrivateRoomSettings,
  ): Promise<void>;
  onReady(ready: boolean): void;
  onStart(): void;
  onLeave(): void;
  onClose(): void;
  onConfigure(settings: MatchSettings): void;
  onTeam(team: Team): void;
  onLobby(): void;
  onScores(): void;
  initialTab?: 'create' | 'join';
  initialCode?: string;
  ready?: boolean;
  onCancelConnect(): void;
}

export function RoomPanel({
  room,
  error,
  onConnect,
  onReady,
  onStart,
  onLeave,
  onClose,
  onConfigure,
  onTeam,
  onLobby,
  onScores,
  initialTab = 'create',
  initialCode = '',
  ready = true,
  onCancelConnect,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(() => {
    try {
      return (localStorage.getItem('breakpoint.callsign') ?? '').slice(0, 20);
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [copyStatus, setCopyStatus] = useState('');
  const codeElement = useRef<HTMLElement>(null);
  const inviteElement = useRef<HTMLInputElement>(null);
  const inviteUrl = room ? roomInviteUrl(location.href, room.code) : '';
  const [settings, setSettings] = useState<PrivateRoomSettings>({
    ...matchDefaults.ffa,
    mapId: defaultMultiplayerMapId,
  });
  useEffect(() => {
    const element = dialog.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    return () => {
      element.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (room?.code) codeElement.current?.focus({ preventScroll: true });
  }, [room?.code]);
  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(''), 3000);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  function close() {
    if (busy && !room) onCancelConnect();
    onClose();
  }
  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopyStatus('CODE COPIED');
    } catch {
      if (codeElement.current) {
        const range = document.createRange();
        range.selectNodeContents(codeElement.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setCopyStatus('CODE SELECTED · PRESS CTRL+C');
    }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyStatus('INVITE COPIED');
    } catch {
      inviteElement.current?.focus();
      inviteElement.current?.select();
      setCopyStatus('INVITE SELECTED · PRESS CTRL+C');
    }
  }
  const self = room?.players.find((player) => player.id === room.selfId);
  const host = room?.hostId === room?.selfId;
  async function connect(mode: 'create' | 'join') {
    setBusy(true);
    try {
      localStorage.setItem('breakpoint.callsign', name.trim());
    } catch {
      /* Callsign works without storage. */
    }
    try {
      await onConnect(mode, name, code, settings);
    } finally {
      if (dialog.current?.isConnected) setBusy(false);
    }
  }
  return (
    <dialog
      className="room-panel"
      ref={dialog}
      aria-labelledby="room-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="room-heading">
        <span className="eyebrow">
          {room ? arenas[room.mapId].name.toUpperCase() : 'MULTIPLAYER'} /
          PRIVATE SESSION
        </span>
        <button
          className="room-button"
          onClick={close}
          aria-label="Close rooms"
        >
          ×
        </button>
      </div>
      <h2 id="room-title">
        {room
          ? 'YOUR SQUAD.'
          : tab === 'create'
            ? 'OPEN A FREQUENCY.'
            : 'FIND YOUR SQUAD.'}
      </h2>
      {room ? (
        <>
          <div className="room-code-row">
            <div>
              <span>ROOM CODE</span>
              <strong data-testid="room-code" ref={codeElement} tabIndex={-1}>
                {room.code}
              </strong>
            </div>
            <span data-testid="room-occupancy">
              {room.players.length} / {room.playerLimit ?? 8} PLAYERS
            </span>
            <button
              className="room-button copy-code"
              onClick={() => {
                void copyCode();
              }}
            >
              COPY CODE
            </button>
          </div>
          <div className="invite-row">
            <input
              ref={inviteElement}
              aria-label="Room invite link"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              className="room-button"
              onClick={() => {
                void copyInvite();
              }}
            >
              COPY INVITE
            </button>
          </div>
          {copyStatus && (
            <p className="copy-feedback" role="status">
              {copyStatus}
            </p>
          )}
          <div className="room-rules" data-testid="room-rules">
            {room.match.mode.toUpperCase()} · FIRST TO {room.match.scoreLimit} ·{' '}
            {room.match.durationSeconds / 60} MIN
            <br />
            WEAPONS:{' '}
            {room.allowedWeapons?.length && room.allowedWeapons.length < 4
              ? room.allowedWeapons.map((id) => id.toUpperCase()).join(' + ')
              : 'ALL WEAPONS'}
          </div>
          {host && room.phase === 'lobby' && (
            <LobbySettings
              key={`${room.match.mode}:${room.match.scoreLimit}:${room.match.durationSeconds}`}
              initial={{
                mode: room.match.mode,
                scoreLimit: room.match.scoreLimit,
                durationSeconds: room.match.durationSeconds,
              }}
              onApply={onConfigure}
            />
          )}
          {room.match.mode === 'tdm' && room.phase === 'lobby' && (
            <div className="room-actions team-choices">
              <button
                className="room-button team-blue"
                disabled={
                  self?.team === 'blue' ||
                  room.players.filter((p) => p.team === 'blue').length >= 4
                }
                onClick={() => onTeam('blue')}
              >
                JOIN BLUE
              </button>
              <button
                className="room-button team-orange"
                disabled={
                  self?.team === 'orange' ||
                  room.players.filter((p) => p.team === 'orange').length >= 4
                }
                onClick={() => onTeam('orange')}
              >
                JOIN ORANGE
              </button>
            </div>
          )}
          <p className="room-note">
            {room.match.mode === 'tdm' && room.phase === 'lobby' && (
              <>
                Blue {room.players.filter((p) => p.team === 'blue').length}/4 ·
                Orange {room.players.filter((p) => p.team === 'orange').length}
                /4. Start requires both teams, balanced within one player.
                <br />
              </>
            )}
            Share this code with friends.{' '}
            {room.phase === 'lobby'
              ? 'Ready up, then the host starts the session.'
              : room.phase === 'results'
                ? 'Match complete. The host can return everyone to the lobby.'
                : 'Session in progress. Friends can still join available seats.'}
          </p>
          <ul className="room-roster" aria-label="Players">
            {[...room.players]
              .sort((a, b) => a.slot - b.slot)
              .map((player) => (
                <li key={player.id}>
                  <span>
                    {player.name}
                    {player.id === room.selfId ? ' (you)' : ''}{' '}
                    {player.id === room.hostId && <small>HOST</small>}
                    {room.match.mode === 'tdm' && (
                      <small className={`team-${player.team}`}>
                        {' '}
                        {player.team.toUpperCase()}
                      </small>
                    )}
                  </span>
                  <span>
                    {room.phase === 'results'
                      ? 'RESULTS'
                      : room.phase === 'countdown'
                        ? 'GET READY'
                        : room.phase === 'playing'
                          ? 'IN SESSION'
                          : player.ready
                            ? 'READY'
                            : 'NOT READY'}
                  </span>
                </li>
              ))}
          </ul>
          <div className="room-actions">
            {room.phase === 'lobby' && (
              <button
                className="room-button primary"
                onClick={() => onReady(!self?.ready)}
              >
                {self?.ready ? 'UNREADY' : 'READY UP'}
              </button>
            )}
            {room.phase === 'lobby' && host && (
              <button
                className="room-button primary"
                disabled={
                  !room.players.every((player) => player.ready) ||
                  (room.match.mode === 'tdm' &&
                    (!room.players.some((p) => p.team === 'blue') ||
                      !room.players.some((p) => p.team === 'orange') ||
                      Math.abs(
                        room.players.filter((p) => p.team === 'blue').length -
                          room.players.filter((p) => p.team === 'orange')
                            .length,
                      ) > 1))
                }
                onClick={onStart}
              >
                START SESSION
              </button>
            )}
            {room.phase === 'playing' && (
              <button className="room-button primary" onClick={onClose}>
                BACK TO ARENA
              </button>
            )}
            {room.phase === 'playing' && (
              <button className="room-button" onClick={onScores}>
                SCOREBOARD
              </button>
            )}
            {room.phase === 'results' && host && (
              <button className="room-button primary" onClick={onLobby}>
                RETURN TO LOBBY
              </button>
            )}
            <button className="room-button" onClick={onLeave}>
              LEAVE ROOM
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => event.preventDefault()} aria-busy={busy}>
          <div
            className="room-tabs"
            role="tablist"
            aria-label="Room connection"
            onKeyDown={(event) => {
              if (
                busy ||
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'create'
                  : event.key === 'End'
                    ? 'join'
                    : tab === 'create'
                      ? 'join'
                      : 'create';
              setTab(next);
              document.getElementById(`room-tab-${next}`)?.focus();
            }}
          >
            <button
              type="button"
              role="tab"
              id="room-tab-create"
              tabIndex={tab === 'create' ? 0 : -1}
              aria-selected={tab === 'create'}
              aria-controls="room-connect-form"
              disabled={busy}
              onClick={() => setTab('create')}
            >
              CREATE ROOM
            </button>
            <button
              type="button"
              role="tab"
              id="room-tab-join"
              tabIndex={tab === 'join' ? 0 : -1}
              aria-selected={tab === 'join'}
              aria-controls="room-connect-form"
              disabled={busy}
              onClick={() => setTab('join')}
            >
              JOIN ROOM
            </button>
          </div>
          <p className="room-note">
            {tab === 'create'
              ? 'Your squad. Your rules. Choose FFA or TDM and share a private room code.'
              : 'Enter your callsign and a six-character code to join your squad.'}
          </p>
          <label className="room-field">
            PLAYER NAME
            <input
              autoFocus
              autoComplete="nickname"
              maxLength={20}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your callsign"
            />
          </label>
          <div
            id="room-connect-form"
            role="tabpanel"
            aria-labelledby={`room-tab-${tab}`}
          >
            {tab === 'create' ? (
              <>
                <MatchFields
                  value={settings}
                  onChange={(value) =>
                    setSettings((previous) => ({ ...previous, ...value }))
                  }
                />
                <PrivateRoomFields
                  value={settings}
                  onChange={setSettings}
                  disabled={busy}
                />
                <button
                  className="room-button primary full-width"
                  disabled={
                    !ready ||
                    busy ||
                    !name.trim() ||
                    !parsePrivateRoomSettings(settings)
                  }
                  onClick={() => {
                    void connect('create');
                  }}
                >
                  CREATE PRIVATE ROOM
                </button>
              </>
            ) : (
              <>
                <label className="room-field">
                  ROOM CODE
                  <input
                    autoComplete="off"
                    maxLength={6}
                    value={code}
                    disabled={busy}
                    onChange={(event) =>
                      setCode(event.target.value.toUpperCase())
                    }
                    placeholder="ABC234"
                  />
                </label>
                <button
                  className="room-button full-width"
                  disabled={
                    !ready || busy || !name.trim() || code.trim().length !== 6
                  }
                  onClick={() => {
                    void connect('join');
                  }}
                >
                  JOIN ROOM
                </button>
              </>
            )}
          </div>
          {busy && (
            <p className="room-note" role="status">
              ESTABLISHING COMMS… The room service may need a moment to wake up.
              Close this window to cancel.
            </p>
          )}
        </form>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <p className="room-note room-scope">
        {room
          ? 'RESPAWN / 3 SEC · Releasing the mouse keeps your match live.'
          : 'PRIVATE COMMS ONLY · Keep the code with your squad.'}
      </p>
    </dialog>
  );
}
