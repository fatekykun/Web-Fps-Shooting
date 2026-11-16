import { MeshLambertMaterial, type MeshLambertMaterialParameters } from 'three';

/** Opaque, depth-tested edge fill in the existing draw; no outline geometry or x-ray pass. */
export function createReadableMaterial(
  parameters: MeshLambertMaterialParameters = {},
  rim = 0.2,
): MeshLambertMaterial {
  const material = new MeshLambertMaterial({
    flatShading: true,
    emissive: 0x1d2622,
    emissiveIntensity: 0.45,
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
  material.customProgramCacheKey = () => `breakpoint-readable-v1-${rim}`;
  return material;
}
