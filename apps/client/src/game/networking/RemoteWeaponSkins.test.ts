import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Vector3,
} from 'three';
import { expect, it, vi } from 'vitest';
import { weaponAsset } from '../weapons/WeaponAssets';
import { RemoteWeaponSkins } from './RemoteWeaponSkins';

vi.mock('../weapons/WeaponAssets', () => ({ weaponAsset: vi.fn() }));

it('batches one finish for multiple remote players and frees its renderer resources', async () => {
  const source = new Group();
  const geometry = new BoxGeometry(0.2, 0.2, 1);
  const material = new MeshStandardMaterial();
  source.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const anchor = new Group();
  anchor.name = 'Muzzle_Anchor';
  anchor.position.z = -0.5;
  source.add(anchor);
  vi.mocked(weaponAsset).mockResolvedValue({ scene: source } as Awaited<
    NonNullable<ReturnType<typeof weaponAsset>>
  >);
  const scene = new Scene();
  const skins = new RemoteWeaponSkins(scene);
  const pose = new Matrix4().makeTranslation(3, 4, 5);
  expect(skins.append('smg', 'neon-blade', pose)).toBe(false);
  await Promise.resolve();
  expect(skins.append('smg', 'neon-blade', pose)).toBe(true);
  expect(skins.append('smg', 'neon-blade', new Matrix4())).toBe(true);
  skins.end();
  expect(weaponAsset).toHaveBeenCalledTimes(1);
  expect(scene.children).toHaveLength(1);
  const batch = scene.children[0] as InstancedMesh;
  expect(batch.count).toBe(2);
  const instance = new Matrix4();
  batch.getMatrixAt(0, instance);
  expect(instance.elements).toEqual(pose.elements);
  skins.begin();
  skins.end();
  expect(batch.visible).toBe(false);
  const disposed = vi.fn();
  batch.geometry.addEventListener('dispose', disposed);
  skins.dispose();
  expect(disposed).toHaveBeenCalledOnce();
  expect(scene.children).toHaveLength(0);
});

it('keeps the remote Molten Lava silhouette free of unplaced embers', async () => {
  vi.mocked(weaponAsset).mockReturnValueOnce(undefined);
  const scene = new Scene();
  const skins = new RemoteWeaponSkins(scene);
  const pose = new Matrix4();
  try {
    expect(skins.append('rifle', 'cinder-wyrm', pose)).toBe(false);
    await Promise.resolve();
    expect(skins.append('rifle', 'cinder-wyrm', pose)).toBe(true);
    skins.end();
    expect(scene.children).toHaveLength(2);
    for (const child of scene.children as InstancedMesh[]) {
      child.geometry.computeBoundingBox();
      const size = child.geometry.boundingBox!.getSize(new Vector3());
      expect(size.z).toBeGreaterThan(size.y * 2);
    }
  } finally {
    skins.dispose();
  }
});
