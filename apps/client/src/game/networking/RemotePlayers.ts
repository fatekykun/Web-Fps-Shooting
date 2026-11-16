import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Object3D,
  type Scene,
} from 'three';
import type { PublicPlayer } from '@breakpoint/shared/network';
import { RemoteInterpolation } from './RemoteInterpolation';
import {
  avatarParts as parts,
  avatarScale,
  standingAnchor,
} from '@breakpoint/shared/avatar';
import { createReadableMaterial } from '../rendering/ReadableMaterial';

const colors = [
  0xf0b584, 0x83d8e5, 0xe0d88d, 0xc4a4e4, 0xa1d89a, 0xed9d9b, 0xafcce4,
  0xead3b6,
];

export class RemotePlayers {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = createReadableMaterial();
  private readonly mesh = new InstancedMesh(
    this.geometry,
    this.material,
    8 * parts.length,
  );
  private readonly root = new Object3D();
  private readonly part = new Object3D();
  private readonly color = new Color();
  private count = 0;
  private readonly tints = new Uint32Array(8 * parts.length).fill(0xffffffff);
  private colorsChanged = false;

  get playerCount(): number {
    return this.count / parts.length;
  }

  constructor(private readonly scene: Scene) {
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // The pool moves across the entire arena, so do not keep a stale instance bounding sphere.
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(buffer: RemoteInterpolation | undefined, now: number): void {
    this.count = 0;
    this.colorsChanged = false;
    buffer?.sample(now, this.write);
    this.mesh.count = this.count;
    if (this.count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.colorsChanged && this.mesh.instanceColor)
        this.mesh.instanceColor.needsUpdate = true;
    }
  }

  private readonly write = (player: PublicPlayer): void => {
    if (!player.alive) return;
    this.root.position.set(player.x, player.y - standingAnchor, player.z);
    this.root.rotation.y = player.yaw;
    this.root.scale.set(1, avatarScale(player.halfHeight), 1);
    this.root.updateMatrixWorld(true);
    parts.forEach(([x, y, z, sx, sy, sz], index) => {
      this.part.position.set(x, y, z);
      this.part.scale.set(sx, sy, sz);
      this.part.rotation.x = index === 0 || index === 6 ? player.pitch : 0;
      this.part.updateMatrix();
      this.part.matrix.premultiply(this.root.matrixWorld);
      this.mesh.setMatrixAt(this.count, this.part.matrix);
      const tint = player.protected
        ? player.team === 'orange'
          ? 0xffd0a0
          : 0x9aedef
        : index === 0
          ? 0xd0d2b9
          : index === 6
            ? 0x516367
            : player.team === 'blue'
              ? 0x7bd5e5
              : player.team === 'orange'
                ? 0xefac72
                : colors[player.slot]!;
      if (this.tints[this.count] !== tint) {
        this.tints[this.count] = tint;
        this.mesh.setColorAt(this.count, this.color.setHex(tint));
        this.colorsChanged = true;
      }
      this.count++;
    });
  };

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
