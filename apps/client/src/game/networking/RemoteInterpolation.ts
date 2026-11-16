import {
  networkConfig,
  type PublicPlayer,
  type RoomView,
} from '@breakpoint/shared/network';

interface Sample {
  tick: number;
  player: PublicPlayer;
}
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

/** Bounded histories; no extrapolation through walls on a stalled connection. */
export class RemoteInterpolation {
  private readonly histories = new Map<string, Sample[]>();
  private latestTick = 0;
  private receivedAt = 0;

  push(view: RoomView, now: number): void {
    this.latestTick = view.tick;
    this.receivedAt = now;
    const ids = new Set(
      view.players.filter((p) => p.id !== view.selfId).map((p) => p.id),
    );
    for (const id of this.histories.keys())
      if (!ids.has(id)) this.histories.delete(id);
    for (const player of view.players) {
      if (player.id === view.selfId) continue;
      const history = this.histories.get(player.id) ?? [];
      const previous = history.at(-1)?.player;
      if (
        previous &&
        (previous.life !== player.life || previous.alive !== player.alive)
      )
        history.length = 0;
      if (history.at(-1)?.tick === view.tick) continue;
      history.push({ tick: view.tick, player });
      if (history.length > 16) history.shift();
      this.histories.set(player.id, history);
    }
  }

  sample(now: number, consume: (player: PublicPlayer) => void): void {
    const tick =
      this.latestTick +
      (Math.max(0, now - this.receivedAt) * networkConfig.tickRate) / 1000 -
      networkConfig.interpolationDelay;
    for (const history of this.histories.values()) {
      while (history.length > 2 && history[1]!.tick <= tick) history.shift();
      const a = history[0]!;
      const b = history[1] ?? a;
      const t =
        b.tick === a.tick
          ? 0
          : Math.max(0, Math.min(1, (tick - a.tick) / (b.tick - a.tick)));
      consume({
        ...b.player,
        x: a.player.x + (b.player.x - a.player.x) * t,
        y: a.player.y + (b.player.y - a.player.y) * t,
        z: a.player.z + (b.player.z - a.player.z) * t,
        halfHeight:
          a.player.halfHeight + (b.player.halfHeight - a.player.halfHeight) * t,
        yaw: lerpAngle(a.player.yaw, b.player.yaw, t),
        pitch: a.player.pitch + (b.player.pitch - a.player.pitch) * t,
      });
    }
  }

  clear(): void {
    this.histories.clear();
  }
}
