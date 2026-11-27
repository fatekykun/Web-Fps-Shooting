import {
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
} from 'three';

/** Opaque, depth-tested edge fill in the existing draw; no outline geometry or x-ray pass. */
export function createReadableMaterial(
  parameters: MeshStandardMaterialParameters = {},
  rim = 0.2,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    roughness: 0.68,
    metalness: 0.14,
    emissive: 0x1d2622,
    emissiveIntensity: 0.28,
    ...parameters,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      float edgeFill = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      outgoingLight += diffuseColor.rgb * ${rim.toFixed(3)} * edgeFill * edgeFill * edgeFill;
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `breakpoint-readable-pbr-${rim}`;
  return material;
}
