import {
  networkConfig,
  type PublicPlayer,
  type RoomView,
} from '@breakpoint/shared/network';
import { animationFields } from '@breakpoint/shared/animation';

interface Sample {
  tick: number;
  player: PublicPlayer;
}

const tickMs = 1000 / networkConfig.tickRate;

export function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

/** Bounded histories; no extrapolation through walls on a stalled connection. */
export class RemoteInterpolation {
  private readonly histories = new Map<string, Sample[]>();
  private latestTick = 0;
  private receivedAt?: number;
  private jitterMs = 0;
  private snapshotSpacing: number = networkConfig.snapshotTicks;
  private renderedTick = 0;
  private renderedAt?: number;

  get delaySeconds(): number {
    const ticks = Math.min(
      networkConfig.maxInterpolationDelay,
      Math.max(networkConfig.interpolationDelay, this.snapshotSpacing + 0.5) +
        (2 * this.jitterMs) / tickMs,
    );
    return ticks / networkConfig.tickRate;
  }

  push(view: RoomView, now: number): void {
    if (view.tick < this.latestTick) return;
    if (this.receivedAt === undefined || view.tick > this.latestTick) {
      if (this.receivedAt !== undefined) {
        const arrivalGap = now - this.receivedAt;
        const tickGap = view.tick - this.latestTick;
        const serverGap = tickGap * tickMs;
        const variation = Math.min(100, Math.abs(arrivalGap - serverGap));
        this.jitterMs += (variation - this.jitterMs) / 8;
        this.snapshotSpacing +=
          (Math.min(networkConfig.maxInterpolationDelay, tickGap) -
            this.snapshotSpacing) /
          8;
      }
      this.latestTick = view.tick;
      this.receivedAt = now;
    }
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
    if (this.receivedAt === undefined) return;
    const target = Math.min(
      this.latestTick,
      this.latestTick +
        Math.max(0, now - this.receivedAt) / tickMs -
        this.delaySeconds * networkConfig.tickRate,
    );
    const delta = now - (this.renderedAt ?? now);
    if (this.renderedAt === undefined || delta > 100) {
      this.renderedTick = Math.max(this.renderedTick, target);
    } else if (delta > 0) {
      // Ease clock corrections so packet spacing cannot rewind or jump an avatar.
      const advance = delta / tickMs;
      const error = target - (this.renderedTick + advance);
      const rate = Math.max(0.75, Math.min(1.25, 1 + error / 6));
      this.renderedTick = Math.min(
        this.latestTick,
        this.renderedTick + advance * rate,
      );
    }
    this.renderedAt = now;
    const tick = this.renderedTick;
    for (const history of this.histories.values()) {
      while (history.length > 2 && history[1]!.tick <= tick) history.shift();
      const a = history[0]!;
      const b = history[1] ?? a;
      const t =
        b.tick === a.tick
          ? 0
          : Math.max(0, Math.min(1, (tick - a.tick) / (b.tick - a.tick)));
      const result: PublicPlayer = {
        ...b.player,
        x: a.player.x + (b.player.x - a.player.x) * t,
        y: a.player.y + (b.player.y - a.player.y) * t,
        z: a.player.z + (b.player.z - a.player.z) * t,
        halfHeight:
          a.player.halfHeight + (b.player.halfHeight - a.player.halfHeight) * t,
        yaw: lerpAngle(a.player.yaw, b.player.yaw, t),
        pitch: a.player.pitch + (b.player.pitch - a.player.pitch) * t,
        gaitPhase: lerpAngle(
          a.player.gaitPhase ?? 0,
          b.player.gaitPhase ?? 0,
          t,
        ),
        gaitAmount:
          (a.player.gaitAmount ?? 0) +
          ((b.player.gaitAmount ?? 0) - (a.player.gaitAmount ?? 0)) * t,
      };
      for (const field of animationFields) {
        if (field === 'gaitPhase') continue;
        if (a.player[field] === undefined && b.player[field] === undefined)
          continue;
        const from = a.player[field] ?? 0,
          to = b.player[field] ?? 0;
        result[field] =
          field === 'hitYaw' ? lerpAngle(from, to, t) : from + (to - from) * t;
      }
      consume(result);
    }
  }

  clear(): void {
    this.histories.clear();
    this.latestTick = this.jitterMs = this.renderedTick = 0;
    this.snapshotSpacing = networkConfig.snapshotTicks;
    this.receivedAt = this.renderedAt = undefined;
  }
}
