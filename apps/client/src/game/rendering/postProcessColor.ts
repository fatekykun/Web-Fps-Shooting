/** Keep the same linear RGBA8 rounding when an AA pass writes directly to the display. */
export function withDisplayColor(fragmentShader: string): string {
  return fragmentShader.replace(
    /}\s*$/,
    `
    gl_FragColor.rgb = floor(clamp(gl_FragColor.rgb, 0.0, 1.0) * 255.0 + 0.5) / 255.0;
    #include <colorspace_fragment>
  }`,
  );
}
