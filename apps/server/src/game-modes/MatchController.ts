import {
  matchLimits,
  matchCountdownSeconds,
  isMatchActive,
  parseMatchSettings,
  spawnCandidates,
} from '@breakpoint/shared/match';
import type { KillEvent } from '@breakpoint/shared/combat';
import {
  ScoreState,
  type PlayerState,
  type RoomState,
} from '../rooms/RoomState';
import type { ServerPlayer } from '../players/ServerPlayer';
import type { ServerCombat } from '../combat/ServerCombat';

/** Match rules own scores and lifecycle; combat only reports validated eliminations. */
export class MatchController {
  private endsAt = 0;
  private beginsAt = 0;
  private lastKill = 0;
  constructor(
    private readonly state: RoomState,
    private readonly players: ReadonlyMap<string, ServerPlayer>,
    private readonly combat: ServerCombat,
    private readonly now = () => performance.now(),
  ) {}

  configure(value: unknown): string | null {
    if (this.state.phase !== 'lobby')
      return 'Match settings can only change in the lobby.';
    const settings = parseMatchSettings(value);
    if (!settings)
      return 'Use FFA/TDM, 1–100 kills and a 30–1800 second duration.';
    const changed = settings.mode !== this.state.mode;
    Object.assign(this.state, settings);
    this.state.remainingSeconds = settings.durationSeconds;
    this.combat.setMode(settings.mode);
    if (changed) {
      let index = 0;
      for (const player of this.state.players.values())
        player.team =
          settings.mode === 'ffa'
            ? 'none'
            : index++ % 2 === 0
              ? 'blue'
              : 'orange';
    }
    this.invalidateReady();
    return null;
  }

  private invalidateReady(): void {
    for (const player of this.state.players.values())
      player.ready = player.id === this.state.hostId;
  }
  assignTeam(player: PlayerState): void {
    if (this.state.mode !== 'tdm') {
      player.team = 'none';
      return;
    }
    const blue = [...this.state.players.values()].filter(
      (p) => p.team === 'blue',
    ).length;
    const orange = [...this.state.players.values()].filter(
      (p) => p.team === 'orange',
    ).length;
    player.team = blue <= orange ? 'blue' : 'orange';
  }
  changeTeam(id: string, value: unknown): string | null {
    if (this.state.phase !== 'lobby' || this.state.mode !== 'tdm')
      return 'Teams can only change in a TDM lobby.';
    if (value !== 'blue' && value !== 'orange') return 'Choose Blue or Orange.';
    const player = this.state.players.get(id);
    if (!player || player.team === value) return null;
    if (
      [...this.state.players.values()].filter((p) => p.team === value).length >=
      matchLimits.maxTeamSize
    )
      return 'That team already has four players.';
    player.team = value;
    this.invalidateReady();
    return null;
  }
  canJoin(): boolean {
    return (
      !isMatchActive(this.state.phase) ||
      this.state.scores.size < matchLimits.maxParticipants
    );
  }
  joined(player: ServerPlayer): void {
    if (!isMatchActive(this.state.phase)) return;
    this.addScore(player.state);
    if (this.state.phase === 'playing' && player.arena.preferCoveredSpawns)
      player.respawn(this.combat.chooseSpawn(player));
    else if (this.state.mode === 'tdm') this.place(player, true);
  }
  left(id: string): void {
    if (isMatchActive(this.state.phase)) {
      const row = this.state.scores.get(id);
      if (row) row.connected = false;
    }
  }
  private addScore(player: PlayerState): void {
    this.state.scores.set(
      player.id,
      new ScoreState({ id: player.id, name: player.name, team: player.team }),
    );
  }
  private place(player: ServerPlayer, avoidOccupied = false): void {
    const points = spawnCandidates(player.state.team, player.arena);
    const teammates = [...this.state.players.values()].filter(
      (p) => p.team === player.state.team && p.slot < player.state.slot,
    ).length;
    const preferred = teammates % points.length;
    const ordered = [...points.slice(preferred), ...points.slice(0, preferred)];
    const position = avoidOccupied
      ? (ordered.find((point) =>
          [...this.players.values()].every(
            (other) =>
              other === player ||
              !other.state.alive ||
              Math.hypot(point.x - other.state.x, point.z - other.state.z) >=
                1.5,
          ),
        ) ?? ordered[0]!)
      : ordered[0]!;
    player.respawn(position);
  }

  start(): string | null {
    if (this.state.phase !== 'lobby')
      return 'The match is already running or showing results.';
    const players = [...this.state.players.values()];
    if (!players.length || players.some((p) => !p.ready))
      return 'Everyone must be ready before starting.';
    if (this.state.mode === 'tdm') {
      const blue = players.filter((p) => p.team === 'blue').length,
        orange = players.filter((p) => p.team === 'orange').length;
      if (
        !blue ||
        !orange ||
        Math.abs(blue - orange) > 1 ||
        blue > 4 ||
        orange > 4
      )
        return 'TDM needs both teams, balanced within one player (maximum four each).';
    }
    this.state.scores.clear();
    this.state.blueScore = this.state.orangeScore = 0;
    this.state.winnerId = this.state.winnerName = this.state.endReason = '';
    this.state.winningTeam = 'none';
    this.state.round++;
    this.lastKill = 0;
    this.beginsAt = this.now() + matchCountdownSeconds * 1000;
    this.endsAt = 0;
    this.state.countdownSeconds = matchCountdownSeconds;
    this.state.remainingSeconds = this.state.durationSeconds;
    for (const player of this.players.values()) {
      player.freeze();
      if (this.state.mode === 'tdm') this.place(player);
      this.addScore(player.state);
    }
    this.state.phase = 'countdown';
    return null;
  }

  recordKill(kill: KillEvent): void {
    if (
      this.state.phase !== 'playing' ||
      kill.id <= this.lastKill ||
      !kill.killerId ||
      !kill.victimId ||
      kill.killerId === kill.victimId
    )
      return;
    const killer = this.state.scores.get(kill.killerId),
      victim = this.state.scores.get(kill.victimId);
    if (
      !killer ||
      !victim ||
      (this.state.mode === 'tdm' &&
        (killer.team === victim.team || killer.team === 'none'))
    )
      return;
    this.lastKill = kill.id;
    killer.kills++;
    victim.deaths++;
    if (this.state.mode === 'tdm') {
      if (killer.team === 'blue') this.state.blueScore++;
      else this.state.orangeScore++;
    }
  }
  beforeTick(): boolean {
    if (this.state.phase === 'countdown') {
      this.state.countdownSeconds = Math.max(
        0,
        Math.ceil((this.beginsAt - this.now()) / 1000),
      );
      if (this.state.countdownSeconds > 0) return false;
      for (const player of this.players.values()) {
        // Start a new life so inputs from before the spawn cannot override its loadout.
        player.respawn({
          ...player.movement.physics.position,
          yaw: player.state.yaw,
        });
        this.combat.add(player);
      }
      this.endsAt = this.now() + this.state.durationSeconds * 1000;
      this.state.phase = 'playing';
    }
    if (this.state.phase !== 'playing') return false;
    this.state.remainingSeconds = Math.max(
      0,
      Math.ceil((this.endsAt - this.now()) / 1000),
    );
    if (this.state.remainingSeconds === 0) {
      this.finish('time');
      return false;
    }
    return true;
  }
  afterCombat(): void {
    if (this.state.phase !== 'playing') return;
    const reached =
      this.state.mode === 'tdm'
        ? Math.max(this.state.blueScore, this.state.orangeScore) >=
          this.state.scoreLimit
        : [...this.state.scores.values()].some(
            (p) => p.kills >= this.state.scoreLimit,
          );
    if (reached) this.finish('score');
  }
  private finish(reason: 'score' | 'time'): void {
    this.state.phase = 'results';
    this.state.endReason = reason;
    if (this.state.mode === 'tdm') {
      this.state.winningTeam =
        this.state.blueScore === this.state.orangeScore
          ? 'draw'
          : this.state.blueScore > this.state.orangeScore
            ? 'blue'
            : 'orange';
    } else {
      const rows = [...this.state.scores.values()];
      const maximum = Math.max(0, ...rows.map((p) => p.kills));
      const leaders = rows.filter((p) => p.kills === maximum);
      if (maximum > 0 && leaders.length === 1) {
        this.state.winnerId = leaders[0]!.id;
        this.state.winnerName = leaders[0]!.name;
      } else this.state.winningTeam = 'draw';
    }
    for (const player of this.players.values()) player.freeze();
  }
  returnToLobby(): string | null {
    if (this.state.phase !== 'results')
      return 'Return to lobby after the match ends.';
    this.state.phase = 'lobby';
    this.state.countdownSeconds = 0;
    this.state.scores.clear();
    this.state.blueScore = this.state.orangeScore = 0;
    this.state.winnerId = this.state.winnerName = this.state.endReason = '';
    this.state.winningTeam = 'none';
    this.state.remainingSeconds = this.state.durationSeconds;
    for (const player of this.players.values()) {
      if (this.state.mode === 'tdm') this.place(player);
      else
        player.respawn(
          spawnCandidates('none', player.arena)[player.state.slot]!,
        );
      this.combat.add(player);
    }
    this.invalidateReady();
    return null;
  }
}
