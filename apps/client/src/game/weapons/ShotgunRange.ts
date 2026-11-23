import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';
import {
  degreesToRadians,
  spreadDirection,
  type Vector3Like,
} from '@breakpoint/shared';
import { spawn, type ArenaBox } from '@breakpoint/shared/maps';
import type { ShotEvent } from './WeaponController';
import { projectConeRadius } from './ShotgunReticle';
import './shotgunRange.css';

const distances = ['3', '5', '10', '15'];
const width = 8;
const depth = 0.12;
const capacity = 32;

export function shotgunDebugDistance(search: string): number | null {
  const value = new URLSearchParams(search).get('shotgun-debug');
  return value && distances.includes(value) ? Number(value) : null;
}

/** Training-only wall and a bounded history of hits from the real practice raycasts. */
export class ShotgunRange {
  readonly collider: ArenaBox;
  private readonly group = new Group();
  private readonly wallGeometry = new BoxGeometry(width, width, depth);
  private readonly wallMaterial = new MeshBasicMaterial({ color: 0x28393a });
  private readonly grid = new GridHelper(width, 16, 0x9fad95, 0x546864);
  private readonly geometry = new BufferGeometry();
  private readonly positions = new BufferAttribute(
    new Float32Array(capacity * 3),
    3,
  );
  private readonly material = new PointsMaterial({
    color: 0xffb75e,
    size: 0.095,
  });
  private readonly panel = document.createElement('div');
  private readonly aim: Vector3Like = { x: 0, y: 0, z: -1 };
  private readonly face: number;
  private cursor = 0;
  private markers = 0;
  private sequence = 0;
  private shotAngle = 0;
  private wallDistance = 0;
  private impacts = 0;
  private outside = 0;

  constructor(
    scene: Scene,
    host: HTMLElement,
    private readonly distance: number,
  ) {
    this.face = spawn.z - distance;
    const wall = new Mesh(this.wallGeometry, this.wallMaterial);
    wall.position.set(0, width / 2, this.face - depth / 2);
    this.collider = {
      position: [wall.position.x, wall.position.y, wall.position.z],
      size: [width, width, depth],
      color: this.wallMaterial.color.getHex(),
    };
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.set(0, width / 2, this.face + 0.005);
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setDrawRange(0, 0);
    const points = new Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.group.add(wall, this.grid, points);
    scene.add(this.group);
    this.panel.dataset.testid = 'shotgun-range';
    this.panel.className = 'shotgun-range';
    this.panel.hidden = true;
    host.appendChild(this.panel);
  }

  setActive(active: boolean): void {
    this.group.visible = active;
    this.panel.hidden = true;
    this.cursor =
      this.markers =
      this.sequence =
      this.impacts =
      this.outside =
        0;
    this.geometry.setDrawRange(0, 0);
  }

  record(
    shot: ShotEvent,
    origin: Vector3Like,
    end: Vector3Like,
    yaw: number,
    pitch: number,
  ): void {
    if (!this.group.visible || shot.config.id !== 'shotgun') return;
    if (shot.sequence !== this.sequence) {
      this.sequence = shot.sequence;
      this.shotAngle = shot.spread;
      this.wallDistance = origin.z - this.face;
      this.impacts = this.outside = 0;
      spreadDirection(yaw, pitch, 0, 0, 0, this.aim);
    }
    if (
      Math.abs(end.z - this.face) > 0.001 ||
      this.wallDistance <= 0 ||
      Math.abs(end.x) > width / 2 ||
      end.y < 0 ||
      end.y > width
    )
      return;
    this.impacts++;
    const dx = end.x - origin.x,
      dy = end.y - origin.y,
      dz = end.z - origin.z;
    const { x, y, z } = this.aim;
    const angle = Math.atan2(
      Math.hypot(dy * z - dz * y, dz * x - dx * z, dx * y - dy * x),
      dx * x + dy * y + dz * z,
    );
    if (angle > shot.spread + 1e-6) this.outside++;
    this.positions.setXYZ(this.cursor, end.x, end.y, end.z + 0.012);
    this.positions.needsUpdate = true;
    this.cursor = (this.cursor + 1) % capacity;
    this.markers = Math.min(capacity, this.markers + 1);
    this.geometry.setDrawRange(0, this.markers);
  }

  update(cone?: {
    angle: number;
    radius: number;
    height: number;
    scaleY: number;
  }): void {
    this.panel.hidden = !this.group.visible || !cone;
    if (this.panel.hidden || !cone) return;
    const current = `SHOTGUN RANGE · ${this.distance} m FROM SPAWN\nLIVE ${this.metrics(cone.angle, cone.radius)}`;
    const last = this.sequence
      ? `\nLAST SHOT ${this.metrics(this.shotAngle, projectConeRadius(this.shotAngle, cone.height, cone.scaleY))}\n${this.impacts} WALL IMPACTS · ${this.outside} OUTSIDE CONE · ${this.wallDistance.toFixed(2)} m TO WALL`
      : '\nFIRE AT THE GRID TO PLOT PELLET IMPACTS';
    if (this.panel.textContent !== current + last)
      this.panel.textContent = current + last;
    this.panel.dataset.shot = String(this.sequence);
    this.panel.dataset.impacts = String(this.impacts);
    this.panel.dataset.outside = String(this.outside);
    this.panel.dataset.markers = String(this.markers);
  }

  private metrics(angle: number, radius: number): string {
    return `${(angle / degreesToRadians).toFixed(2)}° HALF-ANGLE · ${radius.toFixed(1)} CSS PX RADIUS`;
  }

  dispose(): void {
    this.panel.remove();
    this.group.removeFromParent();
    this.wallGeometry.dispose();
    this.wallMaterial.dispose();
    this.grid.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
