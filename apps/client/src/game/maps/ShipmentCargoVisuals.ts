import { Color } from 'three';
import {
  containerAnchor,
  placeYardPart,
  type ShipmentContainer,
} from '@breakpoint/shared/maps';
import type {
  ArenaPart as Part,
  ArenaSurface as Surface,
} from './BatchedArena';

export function addShipmentCargo(
  model: ShipmentContainer,
  shell: readonly Part[],
  solids: Surface[],
  trim: Part[],
  paint: Part[],
): void {
  const anchor = containerAnchor(model);
  const part = (offset: Part['position'], size: Part['size'], color: number) =>
    placeYardPart(anchor, model.yaw, offset, size, color);
  const frame = new Color(model.color).multiplyScalar(0.57).getHex();
  for (const box of shell) {
    if (box.kind === 'stair') {
      trim.push({
        ...box,
        size: [box.size[0], 0.026, box.size[2]],
        pitch:
          Math.sign(Math.cos(box.yaw ?? 0)) *
          Math.atan2(box.size[1], box.size[2]),
      });
    } else {
      solids.push({ ...box, tile: box.size[1] < 0.1 ? 1 : 2 });
    }
  }

  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      trim.push(part([side * 1.14, 0, end * 2.94], [0.12, 2.6, 0.12], frame));
      trim.push(part([side * 1.14, end * 1.235, 0], [0.12, 0.13, 6], frame));
      trim.push(part([0, side * 1.235, end * 2.94], [2.4, 0.13, 0.12], frame));
      trim.push(
        part([side * 1.206, -0.89, end * 2.5], [0.016, 0.32, 0.31], 0x7a5543),
      );
      if (
        model.opening === 'through' ||
        (end > 0 && model.opening === 'front')
      ) {
        trim.push(
          part([side * 1.209, 0, end * 3.68], [0.04, 2.18, 0.057], 0x8c938b),
        );
        for (const y of [-0.91, 0.88])
          trim.push(
            part([side * 1.212, y, end * 3.08], [0.055, 0.12, 0.21], frame),
          );
      }
    }
    for (let rib = -6; rib <= 6; rib++) {
      trim.push(
        part([side * 1.203, 0, rib * 0.405], [0.033, 2.31, 0.061], frame),
      );
    }
    for (const [z, width] of [
      [0.8, 0.34],
      [1.07, 0.1],
      [1.26, 0.11],
      [1.51, 0.18],
    ] as const)
      trim.push(
        part([side * 1.226, 0.46, z * side], [0.008, 0.095, width], 0x9c9d83),
      );
    if (!model.opening) {
      trim.push(
        part([side * 0.548, 0, 3.011], [1.073, 2.24, 0.022], model.color),
      );
      trim.push(part([side * 0.43, 0, 3.031], [0.035, 2.16, 0.026], 0x8c938b));
      trim.push(part([side * 0.34, -0.28, 3.045], [0.22, 0.057, 0.048], frame));
      for (const y of [-0.79, 0.81])
        trim.push(part([side * 0.97, y, 3.026], [0.15, 0.13, 0.037], frame));
    }
  }
  for (let strip = -3; strip <= 3; strip++) {
    trim.push(part([0, 1.307, strip * 0.75], [2.16, 0.022, 0.086], frame));
  }
  if (model.opening) {
    for (let strip = -4; strip <= 4; strip++)
      trim.push(
        part([0, -1.215, strip * 0.615], [2.2, 0.006, 0.034], 0x454e47),
      );
    trim.push(part([0, 1.199, -0.12], [0.17, 0.063, 1.25], 0x303e37));
    paint.push(part([0, 1.16, -0.12], [0.115, 0.029, 1.07], 0xc7ad74));
  }
  if (model.level === 2) {
    // Overlapping facets form an original canvas cover at the east end of the stack.
    for (let fold = 0; fold < 8; fold++) {
      const hanging = 1.86 + (fold % 3) * 0.16;
      trim.push(
        part(
          [-0.84 + fold * 0.24, 1.12 - hanging / 2, 3.076 + (fold % 2) * 0.052],
          [0.252, hanging, 0.05],
          fold % 2 ? 0x9e926e : 0x7e7458,
        ),
      );
    }
  }
}

export function addShipmentPallet(model: Part, trim: Part[]): void {
  const [width, height, length] = model.size;
  const count = Math.round(height / 0.17);
  for (let layer = 0; layer < count; layer++) {
    const bottom = -height / 2 + layer * 0.17;
    for (const side of [-1, 0, 1])
      trim.push(
        placeYardPart(
          model.position,
          model.yaw ?? 0,
          [side * width * 0.42, bottom + 0.064, 0],
          [0.12, 0.128, length],
          0x65533b,
        ),
      );
    for (let slat = -2; slat <= 2; slat++)
      trim.push(
        placeYardPart(
          model.position,
          model.yaw ?? 0,
          [0, bottom + 0.148, (slat * length) / 5],
          [width, 0.044, length * 0.17],
          model.color,
        ),
      );
  }
}
