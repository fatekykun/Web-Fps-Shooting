import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { arenas } from '@breakpoint/shared/maps';

const labels = [
  { lines: ['NORTH SPAWN'], accent: '#719eb0' },
  { lines: ['SOUTH SPAWN'], accent: '#ca8a61' },
  { lines: ['CENTRAL', 'WATCHTOWER'], accent: '#d3a46a' },
  { lines: ['FREIGHT LANE'], accent: '#d3a46a' },
  { lines: ['BREACH LAB'], accent: '#d3a46a' },
];

type Sign = {
  position: readonly [number, number, number];
  size: readonly [number, number];
  yaw: number;
  label: number;
};

const signs: Sign[] = [
  { position: [0, 3.92, -17.989], size: [4.7, 1], yaw: 0, label: 0 },
  { position: [0, 3.92, 17.989], size: [4.7, 1], yaw: Math.PI, label: 1 },
  {
    position: [-20.989, 2.45, 1.95],
    size: [3.2, 0.58],
    yaw: Math.PI / 2,
    label: 3,
  },
  {
    position: [8.102, 2.55, 3.525],
    size: [1.85, 0.35],
    yaw: -Math.PI / 2,
    label: 4,
  },
  ...arenas.killhouse.towerSigns.map((sign): Sign => ({
    ...sign,
    size: [1.35, 0.47],
    label: 2,
  })),
];

/** Pack the warehouse signs into one texture and submit them in one draw. */
export function addKillhouseSigns(scene: Scene): () => void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const row = 96;
  labels.forEach(({ lines, accent }, index) => {
    const y = index * row;
    context.fillStyle = '#222821';
    context.fillRect(0, y, canvas.width, row);
    context.strokeStyle = '#7f7860';
    context.lineWidth = 5;
    context.strokeRect(3, y + 3, canvas.width - 6, row - 6);
    context.fillStyle = accent;
    context.fillRect(9, y + 10, 13, row - 20);
    context.fillRect(canvas.width - 22, y + 10, 13, row - 20);
    context.fillStyle = '#eee8d3';
    context.font = `bold ${lines.length === 1 ? 54 : 40}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    lines.forEach((line, lineIndex) => {
      const offset = (lineIndex - (lines.length - 1) / 2) * 38;
      context.fillText(line, canvas.width / 2, y + row / 2 + offset, 450);
    });
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = NearestMipmapNearestFilter;
  texture.magFilter = NearestFilter;
  const positions: number[] = [];
  const uv: number[] = [];
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
    [1, 1],
    [0, 1],
  ] as const;
  for (const {
    position: [x, y, z],
    size: [width, height],
    yaw,
    label,
  } of signs) {
    for (const [u, v] of corners) {
      const along = (u - 0.5) * width;
      positions.push(
        x + along * Math.cos(yaw),
        y + (v - 0.5) * height,
        z - along * Math.sin(yaw),
      );
      uv.push(u, 1 - (label * row + 2 + (1 - v) * (row - 4)) / canvas.height);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const material = new MeshBasicMaterial({ map: texture });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return () => {
    mesh.removeFromParent();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  };
}
