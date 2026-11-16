import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshLambertMaterial,
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

const colors = [
  0xd49b70, 0x7dc3d0, 0xc6bf78, 0xb498cf, 0x88b890, 0xd58888, 0x99adc4,
  0xd5bfa2,
];

export class RemotePlayers {
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial();
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
        : index === 0 || index === 6
          ? 0x27332e
          : player.team === 'blue'
            ? 0x79bfd2
            : player.team === 'orange'
              ? 0xd79868
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
