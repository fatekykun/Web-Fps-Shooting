import type { RoomView } from '@breakpoint/shared/network';
import { rankScores, isMatchActive } from '@breakpoint/shared/match';

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
interface Props {
  room: RoomView;
  locked: boolean;
  showScores: boolean;
  onScores(open: boolean): void;
  onLobby(): void;
  onLeave(): void;
  scoreKey?: string;
  touchControls?: boolean;
}
export function MatchHud({
  room,
  locked,
  showScores,
  onScores,
  onLobby,
  onLeave,
  scoreKey = 'TAB',
  touchControls = false,
}: Props) {
  const match = room.match;
  const rows = rankScores(match.scores);
  const results = room.phase === 'results';
  const counting = room.phase === 'countdown';
  const startSignal =
    room.phase === 'playing' &&
    match.round > 0 &&
    match.remainingSeconds === match.durationSeconds;
  const self = rows.find((p) => p.id === room.selfId);
  const heading =
    match.winningTeam === 'draw'
      ? 'DRAW'
      : match.mode === 'tdm'
        ? `${match.winningTeam.toUpperCase()} TEAM WINS`
        : `${match.winnerName} WINS`;
  return (
    <>
      {isMatchActive(room.phase) && (
        <aside
          className="match-status"
          aria-label="Match status"
          data-testid="match-status"
          data-phase={room.phase}
        >
          <span className="match-round">
            {match.mode.toUpperCase()} · ROUND {match.round}
          </span>
          <strong data-testid="match-timer">
            {clock(match.remainingSeconds)}
          </strong>
          {match.mode === 'tdm' ? (
            <div className="team-score" data-testid="team-score">
              <span className="team-blue">BLUE {match.blueScore}</span> /{' '}
              <span className="team-orange">{match.orangeScore} ORANGE</span>
            </div>
          ) : (
            <div data-testid="ffa-score">
              {self?.kills ?? 0} / {match.scoreLimit} KILLS
            </div>
          )}
          <span className="match-score-hint">
            {locked ? (
              touchControls ? (
                'TAP SCORES TO VIEW'
              ) : (
                `HOLD ${scoreKey} FOR SCORES`
              )
            ) : (
              <button className="room-button" onClick={() => onScores(true)}>
                SCOREBOARD
              </button>
            )}
          </span>
        </aside>
      )}
      {(counting || startSignal) && (
        <div
          className={`match-countdown ${locked ? '' : 'uncaptured'} ${counting ? '' : 'go'}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid={counting ? 'match-countdown' : 'match-start-signal'}
        >
          <span>{counting ? 'GET READY' : 'MATCH STARTED'}</span>
          <strong key={counting ? match.countdownSeconds : 'go'}>
            {counting ? Math.max(1, match.countdownSeconds ?? 3) : 'GO'}
          </strong>
          {counting && <small>THE DEPOT / {match.mode.toUpperCase()}</small>}
        </div>
      )}
      {(results || showScores) && room.phase !== 'lobby' && (
        <div className={`scoreboard-layer ${locked ? 'captured' : ''}`}>
          <section
            className="scoreboard-panel"
            aria-label={results ? 'Match results' : 'Scoreboard'}
          >
            <div className="eyebrow">
              {match.mode.toUpperCase()} / ROUND {match.round} / {room.code}
            </div>
            <h2 data-testid={results ? 'match-result' : undefined}>
              {results ? heading : 'SCOREBOARD'}
            </h2>
            <p className="room-note">
              {results
                ? match.endReason === 'score'
                  ? 'Score limit reached.'
                  : 'Time limit reached.'
                : `${clock(match.remainingSeconds)} remaining · First to ${match.scoreLimit}`}
            </p>
            {match.mode === 'tdm' && (
              <div className="results-team-score">
                <strong className="team-blue">BLUE {match.blueScore}</strong>
                <strong className="team-orange">
                  ORANGE {match.orangeScore}
                </strong>
              </div>
            )}
            <div className="score-table-wrap">
              <table className="score-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>PLAYER</th>
                    {match.mode === 'tdm' && <th>TEAM</th>}
                    <th>KILLS</th>
                    <th>DEATHS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={row.id === room.selfId ? 'self-row' : ''}
                    >
                      <td>{index + 1}</td>
                      <td>
                        {row.name}
                        {row.id === room.selfId ? ' (you)' : ''}
                        {!row.connected ? ' · left' : ''}
                      </td>
                      {match.mode === 'tdm' && (
                        <td className={`team-${row.team}`}>
                          {row.team.toUpperCase()}
                        </td>
                      )}
                      <td>{row.kills}</td>
                      <td>{row.deaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results ? (
              <div className="room-actions">
                {room.hostId === room.selfId ? (
                  <button className="room-button primary" onClick={onLobby}>
                    RETURN TO LOBBY
                  </button>
                ) : (
                  <p className="room-note">
                    Waiting for the host to return to the lobby.
                  </p>
                )}
                <button className="room-button" onClick={onLeave}>
                  LEAVE ROOM
                </button>
              </div>
            ) : (
              !locked && (
                <button className="room-button" onClick={() => onScores(false)}>
                  CLOSE SCOREBOARD
                </button>
              )
            )}
          </section>
        </div>
      )}
    </>
  );
}
