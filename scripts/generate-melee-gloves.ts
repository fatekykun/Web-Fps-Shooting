// Regenerate the glove asset with node --experimental-strip-types scripts/generate-melee-gloves.ts
import { writeFile } from 'node:fs/promises';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Scene,
  type Material,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

type Point = readonly [x: number, y: number, z: number];
type Joint = readonly [x: number, y: number, z: number, radius: number];

function ellipsoid(center: Point, size: Point) {
  const scale = Math.min(...size);
  return (x: number, y: number, z: number) =>
    (Math.hypot(
      (x - center[0]) / size[0],
      (y - center[1]) / size[1],
      (z - center[2]) / size[2],
    ) -
      1) *
    scale;
}

function fingerSegments(joints: readonly Joint[]) {
  return joints.slice(1).map(([endX, endY, endZ, endRadius], index) => {
    const [startX, startY, startZ, startRadius] = joints[index]!;
    const dx = endX - startX,
      dy = endY - startY,
      dz = endZ - startZ;
    const inverseLength = 1 / (dx * dx + dy * dy + dz * dz);
    return (x: number, y: number, z: number) => {
      const px = x - startX,
        py = y - startY,
        pz = z - startZ;
      const along = Math.min(
        1,
        Math.max(0, (px * dx + py * dy + pz * dz) * inverseLength),
      );
      const lx = px - dx * along,
        ly = py - dy * along,
        lz = pz - dz * along;
      return (
        Math.sqrt(lx * lx + ly * ly + lz * lz) -
        (startRadius + (endRadius - startRadius) * along)
      );
    };
  });
}

/** Blend the palm, thumb, and curved fingers into one smooth glove surface. */
function createMeleeGlove(open: boolean, material: Material) {
  const rise = open ? 0.014 : 0.032;
  const fields = [
    ellipsoid([0.002, 0.001, 0], [0.024, 0.026, 0.026]),
    ellipsoid([0.033, rise * 0.55, -0.002], [0.036, 0.034, 0.024]),
    ellipsoid([0.041, rise * 0.72, 0.014], [0.026, 0.026, 0.011]),
    ...fingerSegments(
      open
        ? [
            [0.02, -0.011, 0.006, 0.015],
            [0.04, -0.031, 0.002, 0.012],
            [0.051, -0.043, -0.008, 0.01],
            [0.063, -0.041, -0.022, 0.007],
          ]
        : [
            [0.024, 0.027, 0.001, 0.016],
            [0.043, 0.06, 0.001, 0.013],
            [0.062, 0.064, -0.01, 0.011],
            [0.072, 0.055, -0.024, 0.008],
          ],
    ),
  ];
  const spread = [-0.026, -0.009, 0.009, 0.025];
  const lengths = [0.052, 0.058, 0.054, 0.043];
  for (const [index, across] of spread.entries()) {
    const y = rise + across;
    const length = lengths[index]!;
    const radius = index === 3 ? 0.0085 : 0.01;
    fields.push(
      ...fingerSegments(
        open
          ? [
              [0.05, y, 0.003, radius * 1.12],
              [0.05 + length * 0.55, y + across * 0.1, 0.004, radius],
              [0.05 + length * 0.85, y + across * 0.2, -0.006, radius * 0.85],
              [0.047 + length, y + across * 0.22, -0.019, radius * 0.67],
            ]
          : [
              [0.051, y, 0.005, radius * 1.15],
              [0.072, y, -0.003, radius],
              [0.084, y - 0.002, -0.025, radius * 0.87],
              [0.076, y - 0.003, -0.042, radius * 0.78],
              [0.061, y - 0.003, -0.05, radius * 0.66],
            ],
      ),
    );
  }

  const resolution = 36;
  const surface = new MarchingCubes(resolution, material, false, false, 14000);
  const extent = [0.1, 0.084, 0.074] as const;
  const center = [0.047, 0.016, -0.012] as const;
  const blend = 0.0055;
  surface.isolation = 0;
  for (let z = 0; z < resolution; z++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++) {
        const px = center[0] + (x * surface.delta - 1) * extent[0];
        const py = center[1] + (y * surface.delta - 1) * extent[1];
        const pz = center[2] + (z * surface.delta - 1) * extent[2];
        let distance = Infinity;
        for (const field of fields) {
          const part = field(px, py, pz);
          const overlap = Math.max(0, blend - Math.abs(part - distance));
          distance =
            Math.min(distance, part) - (overlap * overlap) / (4 * blend);
        }
        surface.setCell(x, y, z, -distance);
      }

  surface.update();
  const geometry = new BufferGeometry();
  const attributeLength = surface.count * 3;
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      surface.positionArray.slice(0, attributeLength),
      3,
    ),
  );
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute(
      surface.normalArray.slice(0, attributeLength),
      3,
    ),
  );
  geometry.scale(...extent).translate(...center);
  surface.geometry.dispose();

  // Raise the glove's knuckle padding a shade above the fabric at the wrist.
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(attributeLength);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const pad = Math.min(1, Math.max(0, (z - 0.003) * 75));
    const knuckle = Math.min(1, Math.max(0, (x - 0.035) * 42));
    const y = positions.getY(i);
    const groove = Math.max(
      0,
      1 -
        Math.min(
          ...[-0.0175, 0, 0.017].map(
            (crease) => Math.abs(y - rise - crease) * 260,
          ),
        ),
    );
    const shade = 0.81 + 0.12 * pad + 0.07 * knuckle - 0.16 * groove * knuckle;
    colors.fill(shade, i * 3, i * 3 + 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return mergeVertices(geometry, 1e-5);
}

// Three's binary exporter uses FileReader for two in-memory blobs.
class BlobReader {
  result?: ArrayBuffer;
  onloadend?: () => void;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
}

Object.assign(globalThis, { FileReader: BlobReader });
const scene = new Scene();
const material = new MeshStandardMaterial({ vertexColors: true });
for (const [name, open] of [
  ['Grip', false],
  ['Open', true],
] as const) {
  const mesh = new Mesh(createMeleeGlove(open, material), material);
  mesh.name = name;
  scene.add(mesh);
}
const output = await new GLTFExporter().parseAsync(scene, { binary: true });
if (!(output instanceof ArrayBuffer)) throw new Error('Expected a binary GLB.');
await writeFile(
  new URL(
    '../apps/client/public/models/first_person_gloves.glb',
    import.meta.url,
  ),
  new Uint8Array(output),
);
