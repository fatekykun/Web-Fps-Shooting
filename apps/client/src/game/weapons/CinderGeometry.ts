import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  RingGeometry,
  Shape,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Profile = readonly (readonly [z: number, y: number])[];

export function armorPlate(
  profile: Profile,
  thickness: number,
  x = 0,
  bevel = 0.003,
): BufferGeometry {
  const outline = new Shape();
  profile.forEach(([z, y], i) =>
    i === 0 ? outline.moveTo(-z, y) : outline.lineTo(-z, y),
  );
  outline.closePath();
  const geometry = new ExtrudeGeometry(outline, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  });
  // Use the same 0–1 face UV coverage as the stock viewmodels.
  const uv = geometry.attributes.uv!;
  let minU = Infinity,
    minV = Infinity,
    maxU = -Infinity,
    maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i),
      v = uv.getY(i);
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      (uv.getX(i) - minU) / (maxU - minU),
      (uv.getY(i) - minV) / (maxV - minV),
    );
  return geometry.rotateY(Math.PI / 2).translate(x - thickness / 2, 0, 0);
}

export class CinderBatch {
  private readonly parts: BufferGeometry[] = [];
  private readonly tint = new Color();

  add(geometry: BufferGeometry, color: number): void {
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    const count = part.attributes.position!.count;
    const colors = new Float32Array(count * 3);
    this.tint.setHex(color);
    for (let i = 0; i < count; i++) this.tint.toArray(colors, i * 3);
    part.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.parts.push(part);
  }

  build(): BufferGeometry {
    const geometry = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    if (!geometry)
      throw new Error('Cinder Wyrm geometry attributes must match');
    return geometry;
  }
}

const obsidian = 0x242733;
const steel = 0x42495a;
const edge = 0x818b9d;
const silver = 0xb3bdc5;
const shadow = 0x12141c;
const ember = 0xf75a11;
const gold = 0xffae32;
const hot = 0xffdb73;
export const cinderCore = { y: 0.007, z: 0.089 } as const;

export function cinderGeometry() {
  const frame = new CinderBatch();
  const lava = new CinderBatch();
  const magazine = new CinderBatch();
  const shard = new CinderBatch();
  const flare = new CinderBatch();
  const part = (profile: Profile, width: number, color: number, x = 0) =>
    frame.add(armorPlate(profile, width, x), color);

  const channel = (
    path: Profile,
    x: number,
    tint: number,
    thickness = 0.003,
    batch = lava,
  ) => {
    for (let i = 1; i < path.length; i++) {
      const [z0, y0] = path[i - 1]!;
      const [z1, y1] = path[i]!;
      const angle = Math.atan2(y1 - y0, z1 - z0);
      batch.add(
        new BoxGeometry(
          0.002,
          thickness,
          Math.hypot(z1 - z0, y1 - y0) + thickness * 0.5,
        )
          .rotateX(-angle)
          .translate(x, (y0 + y1) / 2, (z0 + z1) / 2),
        tint,
      );
    }
  };

  // Lapped receiver, sloping nose, hooked stock and open skeleton brace.
  part(
    [
      [-0.29, -0.045],
      [-0.23, 0.035],
      [-0.13, 0.082],
      [0.138, 0.084],
      [0.207, 0.04],
      [0.165, -0.051],
      [0.074, -0.07],
      [-0.185, -0.066],
    ],
    0.096,
    obsidian,
  );
  part(
    [
      [-0.48, -0.006],
      [-0.51, 0.055],
      [-0.405, 0.066],
      [-0.245, 0.041],
      [-0.205, -0.014],
      [-0.24, -0.042],
      [-0.4, -0.034],
    ],
    0.065,
    steel,
  );
  part(
    [
      [-0.53, 0.011],
      [-0.53, 0.039],
      [-0.371, 0.042],
      [-0.361, 0.012],
    ],
    0.031,
    shadow,
  );
  part(
    [
      [0.13, 0.01],
      [0.226, 0.062],
      [0.322, 0.052],
      [0.424, 0.009],
      [0.417, -0.022],
      [0.321, -0.001],
      [0.213, 0.013],
    ],
    0.079,
    steel,
  );
  part(
    [
      [0.34, 0.038],
      [0.437, 0.014],
      [0.405, -0.061],
      [0.428, -0.112],
      [0.37, -0.091],
      [0.357, -0.034],
    ],
    0.087,
    obsidian,
  );
  part(
    [
      [0.16, -0.025],
      [0.23, -0.024],
      [0.322, -0.082],
      [0.4, -0.075],
      [0.374, -0.113],
      [0.306, -0.11],
      [0.196, -0.053],
    ],
    0.064,
    obsidian,
  );
  part(
    [
      [0.084, -0.047],
      [0.16, -0.045],
      [0.175, -0.116],
      [0.137, -0.23],
      [0.088, -0.218],
      [0.095, -0.158],
      [0.054, -0.097],
    ],
    0.057,
    shadow,
  );
  part(
    [
      [-0.011, -0.049],
      [0.083, -0.053],
      [0.066, -0.088],
      [0.033, -0.104],
      [-0.005, -0.086],
      [-0.021, -0.062],
      [-0.014, -0.112],
      [0.04, -0.127],
      [0.084, -0.1],
      [0.103, -0.058],
    ],
    0.032,
    steel,
  );
  part(
    [
      [-0.067, 0.062],
      [-0.023, 0.101],
      [0.078, 0.096],
      [0.098, 0.062],
    ],
    0.087,
    obsidian,
  );
  // Split projector horns below the sight line leave the optic window open.
  part(
    [
      [0.006, 0.091],
      [0.015, 0.129],
      [0.051, 0.133],
      [0.073, 0.095],
    ],
    0.026,
    shadow,
    -0.041,
  );
  part(
    [
      [0.006, 0.091],
      [0.015, 0.129],
      [0.051, 0.133],
      [0.073, 0.095],
    ],
    0.026,
    shadow,
    0.041,
  );

  // Exposed crown ribs and a heat channel also read from directly behind the rifle.
  for (let i = 0; i < 6; i++) {
    const z = -0.217 + 0.042 * i;
    const y = 0.077 + 0.012 * Math.sin((i / 5) * Math.PI * 0.75);
    const width = 0.07 + i * 0.002;
    frame.add(
      new BoxGeometry(width, 0.013, 0.016).rotateX(0.19).translate(0, y, z),
      i % 2 ? steel : obsidian,
    );
    frame.add(
      new BoxGeometry(width * 0.77, 0.005, 0.01).translate(
        0,
        y + 0.009,
        z + 0.002,
      ),
      i % 2 ? edge : steel,
    );
    lava.add(
      new BoxGeometry(0.024, 0.004, 0.015).translate(0, y + 0.005, z - 0.019),
      i % 2 ? gold : ember,
    );
  }

  // The solid rear spine carries a stepped inlay visible below the optic.
  const spine = [
    [0.12, 0.089, 0.055],
    [0.173, 0.08, 0.048],
    [0.22, 0.066, 0.041],
    [0.263, 0.065, 0.034],
    [0.3, 0.057, 0.027],
  ] as const;
  for (const [i, [z, y, length]] of spine.entries()) {
    frame.add(
      new BoxGeometry(0.041, 0.012, length).rotateX(0.15).translate(0, y, z),
      i % 2 ? steel : shadow,
    );
    lava.add(
      new BoxGeometry(0.012, 0.0045, length * 0.77)
        .rotateX(0.15)
        .translate(0, y + 0.008, z),
      i % 2 ? gold : ember,
    );
    lava.add(
      new BoxGeometry(0.004, 0.0025, length * 0.55)
        .rotateX(0.15)
        .translate(0, y + 0.01, z),
      hot,
    );
  }

  for (const side of [-1, 1]) {
    const x = side * 0.05;
    // Clipped lamellae expose a separate row of recessed heat cells.
    for (let i = 0; i < 8; i++) {
      const z = -0.455 + i * 0.043;
      const y = -0.002 + (i > 4 ? (i - 4) * 0.006 : 0);
      const outer = side * (0.045 + i * 0.0033);
      frame.add(
        armorPlate(
          [
            [z - 0.022, y - 0.005],
            [z - 0.014, y + 0.018],
            [z + 0.018, y + 0.024],
            [z + 0.021, y + 0.009],
            [z + 0.011, y - 0.008],
          ],
          0.008,
          outer,
          0.0015,
        ),
        i % 3 === 0 ? edge : steel,
      );
      channel(
        [
          [z - 0.014, y + 0.012],
          [z - 0.004, y + 0.018],
          [z + 0.014, y + 0.02],
        ],
        outer + side * 0.006,
        i % 3 === 0 ? silver : edge,
        0.0025,
        frame,
      );
      const cell = side * (0.061 + i * 0.0028);
      frame.add(
        new BoxGeometry(0.008, 0.021, 0.043).translate(
          cell - side * 0.005,
          y - 0.012,
          z - 0.004,
        ),
        shadow,
      );
      lava.add(
        new BoxGeometry(0.006, 0.012, 0.04).translate(
          cell,
          y - 0.012,
          z - 0.004,
        ),
        i % 2 ? 0xf13e08 : 0xff7012,
      );
      lava.add(
        new BoxGeometry(0.002, 0.0045, 0.036).translate(
          cell + side * 0.0037,
          y - 0.013,
          z - 0.003,
        ),
        i % 3 ? gold : hot,
      );
      frame.add(
        new BoxGeometry(0.008, 0.023, 0.007)
          .rotateX(i % 2 ? 0.24 : -0.22)
          .translate(cell + side * 0.003, y - 0.012, z + 0.014),
        i % 2 ? steel : obsidian,
      );
      channel(
        [
          [z - 0.023, y + 0.002],
          [z - 0.008, y + 0.002],
          [z + 0.006, y + 0.004],
        ],
        cell - side * 0.001,
        edge,
        0.0019,
        frame,
      );
      channel(
        [
          [z - 0.019, y - 0.024],
          [z + 0.006, y - 0.024],
          [z + 0.018, y - 0.019],
        ],
        cell,
        i % 2 ? ember : 0xcd3c12,
        0.0025,
      );
    }

    // A split tip with staggered edges frames the original centered barrel exit.
    const finX = side * 0.031;
    frame.add(
      armorPlate(
        [
          [-0.528, 0.042],
          [-0.494, 0.057],
          [-0.438, 0.061],
          [-0.41, 0.044],
          [-0.462, 0.044],
          [-0.484, 0.038],
        ],
        0.014,
        finX,
        0.002,
      ),
      steel,
    );
    channel(
      [
        [-0.523, 0.044],
        [-0.496, 0.056],
        [-0.442, 0.059],
      ],
      finX + side * 0.008,
      silver,
      0.0038,
      frame,
    );
    frame.add(
      armorPlate(
        [
          [-0.518, -0.027],
          [-0.475, -0.015],
          [-0.433, -0.019],
          [-0.409, -0.035],
          [-0.466, -0.035],
          [-0.49, -0.043],
        ],
        0.018,
        finX,
        0.002,
      ),
      obsidian,
    );
    channel(
      [
        [-0.515, -0.03],
        [-0.483, -0.04],
        [-0.452, -0.033],
      ],
      finX + side * 0.01,
      edge,
      0.0035,
      frame,
    );

    // Broken dorsal plates and short serrations keep the long silhouette readable.
    for (let i = 0; i < 4; i++) {
      const z = -0.392 + i * 0.077;
      const y = 0.055 + i * 0.011;
      part(
        [
          [z - 0.045, y + 0.004],
          [z - 0.023, y + 0.022],
          [z + 0.005, y + 0.012],
          [z + 0.026, y - 0.002],
          [z - 0.008, y - 0.007],
        ],
        0.015,
        i % 2 ? obsidian : steel,
        x * 0.76,
      );
      channel(
        [
          [z - 0.042, y + 0.006],
          [z - 0.024, y + 0.021],
          [z + 0.003, y + 0.013],
        ],
        x * 0.76 + side * 0.009,
        edge,
        0.0022,
        frame,
      );
      const toothY = -0.042 - i * 0.004;
      part(
        [
          [z - 0.016, toothY + 0.018],
          [z + 0.028, toothY + 0.014],
          [z + 0.017, toothY - 0.015],
          [z + 0.002, toothY - 0.037],
          [z + 0.003, toothY - 0.004],
        ],
        0.018,
        obsidian,
        x * 0.85,
      );
      channel(
        [
          [z + 0.027, toothY + 0.011],
          [z + 0.015, toothY - 0.015],
        ],
        x * 0.85 + side * 0.01,
        i % 2 ? steel : edge,
        0.002,
        frame,
      );
    }
    part(
      [
        [-0.521, 0.049],
        [-0.466, 0.076],
        [-0.371, 0.068],
        [-0.405, 0.059],
        [-0.481, 0.055],
      ],
      0.012,
      edge,
      x * 0.63,
    );
    part(
      [
        [-0.521, -0.045],
        [-0.455, -0.035],
        [-0.405, -0.053],
        [-0.447, -0.059],
        [-0.478, -0.051],
      ],
      0.016,
      steel,
      x * 0.65,
    );
    part(
      [
        [-0.282, 0.028],
        [-0.238, 0.054],
        [-0.204, 0.044],
        [-0.224, 0.035],
        [-0.255, 0.037],
      ],
      0.01,
      edge,
      x * 0.82,
    );
    part(
      [
        [-0.141, 0.092],
        [-0.119, 0.107],
        [-0.061, 0.105],
        [-0.087, 0.094],
        [-0.111, 0.101],
      ],
      0.009,
      edge,
      x * 0.88,
    );
    part(
      [
        [-0.469, 0.037],
        [-0.446, 0.085],
        [-0.334, 0.061],
        [-0.291, 0.027],
        [-0.373, 0.038],
        [-0.397, 0.018],
      ],
      0.026,
      obsidian,
      x * 0.63,
    );
    part(
      [
        [-0.485, -0.039],
        [-0.414, -0.03],
        [-0.338, -0.046],
        [-0.371, -0.071],
        [-0.424, -0.06],
      ],
      0.029,
      obsidian,
      x * 0.7,
    );
    part(
      [
        [-0.382, -0.037],
        [-0.341, 0.018],
        [-0.249, 0.033],
        [-0.207, 0.012],
        [-0.24, -0.025],
        [-0.29, -0.05],
        [-0.323, -0.085],
      ],
      0.022,
      steel,
      x,
    );
    part(
      [
        [-0.27, -0.047],
        [-0.228, 0.011],
        [-0.154, 0.041],
        [-0.112, 0.017],
        [-0.141, -0.014],
        [-0.181, -0.028],
        [-0.22, -0.076],
      ],
      0.029,
      obsidian,
      x * 1.13,
    );
    part(
      [
        [-0.177, 0.052],
        [-0.128, 0.105],
        [-0.047, 0.098],
        [-0.003, 0.062],
        [-0.104, 0.073],
      ],
      0.033,
      steel,
      x * 0.78,
    );
    part(
      [
        [-0.106, -0.047],
        [-0.061, 0.024],
        [0.015, 0.05],
        [0.037, 0.027],
        [0.007, -0.003],
        [-0.052, -0.025],
        [-0.086, -0.084],
      ],
      0.026,
      steel,
      x * 1.2,
    );
    part(
      [
        [0.207, 0.031],
        [0.283, 0.064],
        [0.337, 0.05],
        [0.39, 0.019],
        [0.293, 0.036],
        [0.249, 0.012],
      ],
      0.018,
      obsidian,
      x * 0.78,
    );
    part(
      [
        [0.34, -0.059],
        [0.387, -0.05],
        [0.428, -0.104],
        [0.369, -0.09],
      ],
      0.019,
      steel,
      x * 0.78,
    );
    for (let i = 0; i < 3; i++) {
      const y = -0.103 - i * 0.03;
      part(
        [
          [0.08 + 0.008 * i, y],
          [0.148 - 0.003 * i, y + 0.015],
          [0.143 - 0.003 * i, y - 0.006],
          [0.102 + 0.006 * i, y - 0.022],
        ],
        0.016,
        i === 1 ? obsidian : steel,
        x * 0.56,
      );
    }

    // Angular channels and stepped seams sit over the side plates.
    const seams: Profile[] = [
      [
        [-0.495, 0.024],
        [-0.416, 0.028],
        [-0.397, 0.038],
        [-0.338, 0.038],
        [-0.351, 0.032],
        [-0.394, 0.03],
        [-0.417, 0.021],
      ],
      [
        [-0.371, -0.041],
        [-0.327, -0.015],
        [-0.281, -0.014],
        [-0.264, 0.007],
        [-0.219, 0.016],
        [-0.236, 0.003],
        [-0.264, 0.001],
        [-0.278, -0.02],
        [-0.321, -0.024],
      ],
      [
        [-0.243, -0.052],
        [-0.208, -0.035],
        [-0.194, -0.017],
        [-0.135, -0.009],
        [-0.109, 0.009],
        [-0.087, 0.01],
        [-0.112, 0.002],
        [-0.134, -0.017],
        [-0.188, -0.024],
        [-0.206, -0.045],
      ],
      [
        [-0.113, -0.037],
        [-0.078, -0.024],
        [-0.01, -0.013],
        [0.019, 0.013],
        [0.034, 0.012],
        [0.014, -0.023],
        [-0.048, -0.032],
        [-0.081, -0.052],
      ],
      [
        [0.152, 0.024],
        [0.223, 0.038],
        [0.279, 0.035],
        [0.267, 0.027],
        [0.228, 0.03],
        [0.173, 0.015],
      ],
      [
        [0.23, -0.037],
        [0.271, -0.06],
        [0.32, -0.087],
        [0.35, -0.085],
        [0.324, -0.094],
        [0.28, -0.077],
      ],
      [
        [0.106, -0.116],
        [0.133, -0.126],
        [0.12, -0.154],
        [0.127, -0.172],
        [0.114, -0.192],
        [0.118, -0.171],
        [0.11, -0.156],
        [0.124, -0.13],
      ],
    ];
    seams.forEach((outline, index) => {
      const surfaces = [0.05, 0.064, 0.066, 0.075, 0.051, 0.038, 0.04];
      lava.add(
        armorPlate(outline, 0.003, side * surfaces[index]!, 0),
        index % 3 === 0 ? gold : ember,
      );
    });

    // Hairline branches around the core, the stock brace, and its butt cap.
    channel(
      [
        [-0.146, -0.024],
        [-0.111, -0.031],
        [-0.086, -0.022],
        [-0.066, -0.029],
        [-0.036, -0.016],
        [-0.01, -0.021],
        [0.018, -0.007],
      ],
      side * 0.078,
      0xff761e,
      0.0024,
    );
    channel(
      [
        [-0.081, -0.022],
        [-0.068, 0.001],
        [-0.044, 0.009],
        [-0.035, 0.027],
      ],
      side * 0.077,
      ember,
      0.002,
    );
    channel(
      [
        [0.147, 0.04],
        [0.182, 0.061],
        [0.202, 0.05],
        [0.237, 0.054],
        [0.261, 0.046],
        [0.298, 0.044],
      ],
      side * 0.05,
      gold,
      0.0023,
    );
    channel(
      [
        [0.222, 0.042],
        [0.268, 0.054],
        [0.309, 0.054],
        [0.352, 0.037],
      ],
      side * 0.051,
      edge,
      0.0028,
      frame,
    );
    channel(
      [
        [0.249, -0.055],
        [0.268, -0.073],
        [0.301, -0.091],
        [0.338, -0.095],
        [0.361, -0.088],
      ],
      side * 0.04,
      edge,
      0.003,
      frame,
    );
    for (let i = 0; i < 3; i++) {
      const y = -0.016 - i * 0.023;
      const z = 0.396 - i * 0.003;
      part(
        [
          [z - 0.024, y + 0.005],
          [z + 0.01, y + 0.012],
          [z + 0.026, y - 0.004],
          [z + 0.006, y - 0.008],
        ],
        0.014,
        i % 2 ? steel : obsidian,
        side * 0.044,
      );
      channel(
        [
          [z - 0.01, y + 0.006],
          [z + 0.01, y + 0.006],
        ],
        side * 0.053,
        ember,
        0.0025,
      );
    }

    // Perforated octagonal heat shield beneath the raised segmented core.
    const axis = (side * Math.PI) / 2;
    const { y: coreY, z: coreZ } = cinderCore;
    // Crescent fins follow the rotation of the furnace and flare out over the receiver.
    for (const [i, angle] of [
      -2.86, -2.31, -1.72, -0.98, 0.15, 0.84,
    ].entries()) {
      const orbit = (
        radius: number,
        sweep: number,
      ): readonly [number, number] => [
        coreZ + Math.cos(angle + sweep) * radius,
        coreY + Math.sin(angle + sweep) * radius,
      ];
      const reach = i % 2 ? 0.106 : 0.122;
      const depth = side * (i % 2 ? 0.072 : 0.077);
      frame.add(
        armorPlate(
          [
            orbit(0.057, -0.29),
            orbit(0.077, -0.17),
            orbit(reach, 0.3),
            orbit(reach - 0.02, 0.44),
            orbit(0.072, 0.24),
            orbit(0.057, 0.17),
          ],
          0.017,
          depth,
          0.0025,
        ),
        i % 2 ? obsidian : steel,
      );
      channel(
        [orbit(0.071, -0.16), orbit(0.081, 0.02), orbit(reach - 0.004, 0.29)],
        depth + side * 0.0095,
        i % 2 ? edge : silver,
        0.0026,
        frame,
      );
      channel(
        [orbit(0.052, 0.17), orbit(0.077, 0.21), orbit(reach - 0.023, 0.39)],
        depth + side * 0.01,
        i % 2 ? ember : gold,
        0.0031,
      );
    }
    frame.add(
      new CylinderGeometry(0.072, 0.066, 0.022, 8)
        .rotateZ(axis)
        .translate(side * 0.061, coreY, coreZ),
      shadow,
    );
    frame.add(
      new RingGeometry(0.056, 0.069, 8)
        .rotateY(axis)
        .translate(side * 0.075, coreY, coreZ),
      edge,
    );
    lava.add(
      new CylinderGeometry(0.049, 0.05, 0.022, 12)
        .rotateZ(axis)
        .translate(side * 0.076, coreY, coreZ),
      0x9b2508,
    );
    lava.add(
      new RingGeometry(0.046, 0.052, 12)
        .rotateY(axis)
        .translate(side * 0.089, coreY, coreZ),
      0xdd490b,
    );
    lava.add(
      new CylinderGeometry(0.015, 0.031, 0.016, 8)
        .rotateZ(axis)
        .translate(side * 0.09, coreY, coreZ),
      gold,
    );
    for (let index = 0; index < 8; index++) {
      const angle = (index * Math.PI * 2) / 8 + 0.18;
      const ring = (
        inside: number,
        outside: number,
        span: number,
        depth: number,
      ) =>
        new RingGeometry(inside, outside, 4, 1, angle, span)
          .rotateY(axis)
          .translate(side * depth, coreY, coreZ);
      lava.add(ring(0.035, 0.044, 0.5, 0.093), index % 2 ? gold : hot);
      lava.add(ring(0.063, 0.067, 0.27, 0.096), index % 2 ? ember : gold);
      lava.add(ring(0.025, 0.028, 0.27, 0.095), index % 2 ? gold : ember);
      frame.add(ring(0.052, 0.061, 0.45, 0.094), index % 2 ? obsidian : steel);
      frame.add(
        new BoxGeometry(0.018, 0.017, 0.023)
          .rotateX(angle)
          .translate(
            side * 0.092,
            coreY + Math.cos(angle) * 0.066,
            coreZ + Math.sin(angle) * 0.066,
          ),
        index % 2 ? steel : edge,
      );
    }
    lava.add(
      new CylinderGeometry(0.009, 0.014, 0.006, 6)
        .rotateZ(axis)
        .translate(side * 0.1, coreY, coreZ),
      hot,
    );
  }

  magazine.add(
    armorPlate(
      [
        [-0.114, -0.046],
        [-0.038, -0.046],
        [-0.004, -0.103],
        [-0.025, -0.17],
        [-0.067, -0.231],
        [-0.122, -0.251],
        [-0.158, -0.213],
        [-0.118, -0.191],
        [-0.085, -0.13],
      ],
      0.074,
    ),
    obsidian,
  );
  magazine.add(
    armorPlate(
      [
        [-0.128, -0.222],
        [-0.083, -0.193],
        [-0.068, -0.209],
        [-0.093, -0.244],
        [-0.151, -0.26],
        [-0.171, -0.228],
      ],
      0.086,
    ),
    steel,
  );
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = -0.086 - 0.034 * i;
      const z = -0.066 - i * i * 0.004;
      magazine.add(
        armorPlate(
          [
            [z - 0.048, y - 0.022],
            [z - 0.025, y + 0.012],
            [z + 0.036, y + 0.014],
            [z + 0.019, y - 0.002],
            [z - 0.015, y - 0.006],
          ],
          0.021,
          side * 0.038,
        ),
        i % 2 ? steel : shadow,
      );
      channel(
        [
          [z - 0.033, y - 0.007],
          [z - 0.019, y + 0.006],
          [z + 0.02, y + 0.009],
        ],
        side * 0.052,
        edge,
        0.0022,
        magazine,
      );
      // Local magazine glow moves with the whole articulated magazine.
      flare.add(
        armorPlate(
          [
            [z - 0.042, y - 0.024],
            [z - 0.014, y - 0.01],
            [z + 0.013, y - 0.009],
            [z - 0.016, y - 0.016],
          ],
          0.003,
          side * 0.05,
          0,
        ),
        gold,
      );
    }
  }

  shard.add(
    armorPlate(
      [
        [-0.062, 0.008],
        [-0.034, 0.018],
        [0.027, 0.023],
        [0.06, 0.004],
        [0.022, -0.01],
        [-0.013, -0.008],
        [-0.046, -0.021],
      ],
      0.045,
    ),
    steel,
  );
  shard.add(
    armorPlate(
      [
        [-0.057, 0.006],
        [-0.028, 0.018],
        [0.029, 0.023],
        [0.045, 0.012],
        [-0.016, 0.012],
      ],
      0.02,
      -0.021,
    ),
    obsidian,
  );
  shard.add(
    armorPlate(
      [
        [-0.043, -0.012],
        [-0.017, -0.005],
        [0.032, 0.002],
        [0.013, -0.014],
        [-0.025, -0.02],
      ],
      0.036,
      0,
      0,
    ),
    ember,
  );
  for (const side of [-1, 1]) {
    shard.add(
      armorPlate(
        [
          [-0.061, 0.005],
          [-0.035, 0.026],
          [-0.014, 0.014],
          [0.006, 0.026],
          [0.052, 0.015],
          [0.014, 0.01],
          [-0.019, 0.008],
        ],
        0.012,
        side * 0.018,
        0.0015,
      ),
      side < 0 ? steel : obsidian,
    );
    channel(
      [
        [-0.051, 0.008],
        [-0.034, 0.023],
        [-0.016, 0.014],
      ],
      side * 0.025,
      edge,
      0.0023,
      shard,
    );
    channel(
      [
        [-0.029, -0.009],
        [-0.011, 0.001],
        [0.013, -0.003],
        [0.033, 0.005],
      ],
      side * 0.024,
      gold,
      0.003,
      shard,
    );
  }
  return {
    frame: frame.build(),
    lava: lava.build(),
    magazine: magazine.build(),
    magazineLava: flare.build(),
    shard: shard.build(),
  };
}
