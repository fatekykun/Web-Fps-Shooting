import {
  CircleGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { arenas } from '@breakpoint/shared/maps';
import { KillhouseArena } from '../../apps/client/src/game/maps/KillhouseArena';
import { defaultGraphics } from '../../apps/client/src/game/rendering/graphicsConfig';

const perspectives = {
  west: { position: [-17.65, 3.05, 11.8], focus: [-9.7, 1.6, 0.8] },
  east: { position: [6.6, 4.4, 10.7], focus: [12.6, 1.4, -0.2] },
  tower: { position: [7.5, 2.4, 8.6], focus: [0, 2.4, -0.7] },
} as const;
const requested =
  new URLSearchParams(location.search).get('view') ?? 'overview';
const view =
  requested === 'layout' || Object.hasOwn(perspectives, requested)
    ? requested
    : 'overview';
document
  .querySelector(`a[href="?view=${view}"]`)
  ?.setAttribute('aria-current', 'page');

const scene = new Scene();
const arena = new KillhouseArena(scene);
const matrix = new Matrix4();
const point = new Vector3();
if (view === 'overview' || view === 'layout') {
  const doorHeaders =
    view === 'layout'
      ? arenas.killhouse.rooms.filter(({ position }) => position[1] > 2)
      : [];
  scene.traverse((object) => {
    if (!(object instanceof InstancedMesh)) return;
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix);
      const roof = point.y > 7.7;
      const nearWall =
        view === 'overview' && (point.x > 20.65 || point.z > 17.65);
      const doorway = doorHeaders.some(
        ({ position: [x, y, z] }) =>
          Math.abs(point.x - x) < 0.001 &&
          Math.abs(point.y - y) < 0.001 &&
          Math.abs(point.z - z) < 0.001,
      );
      if (roof || nearWall || doorway)
        object.setMatrixAt(i, matrix.makeScale(0, 0, 0));
    }
    object.instanceMatrix.needsUpdate = true;
  });
}

let markers: InstancedMesh<CircleGeometry, MeshBasicMaterial> | undefined;
if (view === 'layout') {
  const { spawns, respawns } = arenas.killhouse;
  const points = [...spawns.none, ...respawns.candidates];
  markers = new InstancedMesh(
    new CircleGeometry(1, 14),
    new MeshBasicMaterial(),
    points.length,
  );
  points.forEach((spawn, index) => {
    const initial = index < spawns.none.length;
    const radius = initial ? 0.35 : 0.23;
    markers!.setMatrixAt(
      index,
      matrix
        .makeRotationX(-Math.PI / 2)
        .scale(point.setScalar(radius))
        .setPosition(spawn.x, spawn.y + 0.07, spawn.z),
    );
    markers!.setColorAt(
      index,
      new Color(initial ? (spawn.z < 0 ? 0x7cc8e9 : 0xff966a) : 0xeec06d),
    );
  });
  scene.add(markers);
  const legend = document.createElement('p');
  legend.textContent =
    'N ↑   ·   BLUE / ORANGE TEAM DECKS   ·   GOLD SMART SPAWN CANDIDATES';
  document.body.appendChild(legend);
}

const renderer = new WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.shadowMap.enabled = view !== 'layout';
renderer.shadowMap.type = PCFShadowMap;
arena.configure({
  ...defaultGraphics,
  shadowQuality: view === 'layout' ? 'off' : 'high',
  viewDistance: 80,
});
if (view === 'overview' || view === 'layout') scene.fog = null;
document.body.appendChild(renderer.domElement);

function render() {
  const aspect = innerWidth / innerHeight;
  const halfHeight = view === 'layout' ? 22 : 24;
  let camera;
  if (view === 'overview' || view === 'layout') {
    camera = new OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      0.1,
      180,
    );
    if (view === 'layout') {
      camera.up.set(0, 0, -1);
      camera.position.set(0, 64, 0);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(38, 43, 43);
      camera.lookAt(0, 2.7, 0);
    }
  } else {
    const angle = perspectives[view as keyof typeof perspectives];
    camera = new PerspectiveCamera(
      view === 'tower' ? 50 : 52,
      aspect,
      0.08,
      160,
    );
    camera.position.fromArray(angle.position);
    camera.lookAt(point.fromArray(angle.focus));
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.render(scene, camera);
  document.body.dataset.ready = view;
}

render();
window.addEventListener('resize', render);
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  window.removeEventListener('resize', render);
  markers?.geometry.dispose();
  markers?.material.dispose();
  markers?.dispose();
  arena.dispose();
  renderer.dispose();
});
