/**
 * The field's two programs. One full-screen triangle; the fragment shader
 * finds which lattice triangle a pixel is in, reads the source picture at
 * that triangle's centre, and paints the whole triangle one of five levels,
 * the same five the contribution graph uses.
 *
 * Lattice coordinates (see `geometry.ts`): `v` counts rows, `u` counts sides
 * along a row and shifts half a side per row, so a unit cell is a rhombus and
 * its short diagonal (u = v) splits it into two triangles.
 */

export const VERTEX = /* glsl */ `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
uniform vec4 uField;      // x, y, w, h in px, y down from the top
uniform float uCell;      // side of one triangle, px
uniform float uGap;       // half the gutter between triangles, px
uniform float uTime;
uniform float uReveal;    // 0..1, the first sweep
uniform float uMix;       // 0..1, from one source to the next
uniform float uFade;      // 0..1, how far the field has scrolled away
uniform float uNarrow;    // 1 on a phone: dissolve downwards, not sideways
uniform vec3 uPointer;    // x, y in px, strength 0..1

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec4 uFromRect;   // where each picture sits in the field, px
uniform vec4 uToRect;
uniform float uFromKind;  // 0 a cover (every level), 1 a glyph (lit or not)
uniform float uToKind;

uniform vec3 uLevel0;
uniform vec3 uLevel1;
uniform vec3 uLevel2;
uniform vec3 uLevel3;
uniform vec3 uLevel4;

const float ROW = 0.8660254;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// x: luminance 0..1, y: how likely the triangle is to be drawn at all.
vec2 source(sampler2D tex, vec4 rect, float kind, vec2 centre, vec2 field) {
  vec2 uv = (centre - rect.xy) / rect.zw;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 texel = texture2D(tex, clamp(uv, 0.0, 1.0)) * inside;
  float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));

  if (kind > 0.5) {
    // A glyph: its own triangles always, and a thinning scatter around it.
    vec2 away = (centre - (rect.xy + rect.zw * 0.5)) / (rect.zw * vec2(0.9, 1.9));
    float ambient = 0.3 * (1.0 - smoothstep(0.25, 1.0, length(away)));
    return vec2(lum, mix(ambient, 1.0, step(0.5, texel.a)));
  }

  // A cover: solid at the far edge, dissolving towards the text. On a phone
  // it stays inside its own square and thins out down it.
  vec2 n = centre / field;
  float wide = smoothstep(0.1, 0.7, uv.x) * (1.0 - smoothstep(0.9, 1.0, n.y)) * mix(0.4, 1.0, inside);
  float tall = (1.0 - smoothstep(0.38, 1.0, uv.y)) * inside;
  return vec2(lum, mix(wide, tall, uNarrow));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) - uField.xy;

  float v = p.y / (uCell * ROW);
  float u = p.x / uCell + 0.5 * v;
  vec2 cell = floor(vec2(u, v));
  vec2 f = vec2(u, v) - cell;

  float upper = step(f.y, f.x);
  vec3 bary = mix(
    vec3(1.0 - f.y, f.y - f.x, f.x),
    vec3(1.0 - f.x, f.x - f.y, f.y),
    upper
  );
  vec2 centreUv = cell + mix(vec2(1.0 / 3.0, 2.0 / 3.0), vec2(2.0 / 3.0, 1.0 / 3.0), upper);
  vec2 centre = vec2((centreUv.x - 0.5 * centreUv.y) * uCell, centreUv.y * uCell * ROW);

  // The picture stops at the field's own box, part-way through a triangle if
  // need be. Past it the lattice is empty until the pointer uncovers it.
  float inField = step(0.0, p.x) * step(0.0, p.y) * step(p.x, uField.z) * step(p.y, uField.w);
  if (inField < 0.5 && uPointer.z < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float id = hash(cell * 2.0 + upper);
  float id2 = hash(cell.yx * 3.0 + upper + 7.0);
  vec2 n = centre / uField.zw;

  // Both sweeps run along the lattice's own slant, with a ragged front.
  float diagonal = n.x * 0.75 + n.y * 0.25 + id * 0.16;

  float mixFront = diagonal - (uMix * 1.5 - 0.25);
  float useTo = step(mixFront, 0.0);
  vec2 a = source(uFrom, uFromRect, uFromKind, centre, uField.zw);
  vec2 b = source(uTo, uToRect, uToKind, centre, uField.zw);
  vec2 s = mix(a, b, useTo) * inField;
  float kind = mix(uFromKind, uToKind, useTo);

  float revealFront = mix(1.0, (uReveal * 1.5 - 0.25) - diagonal, inField);
  mixFront = mix(1.0, mixFront, inField);

  // The pointer uncovers the lattice around it and lifts what is there.
  float reach = uCell * 6.5;
  float near = uPointer.z * (1.0 - smoothstep(0.0, reach, distance(centre, uPointer.xy - uField.xy)));

  float presence = s.y * (1.0 - uFade) + near * 0.85;
  if (id2 > presence || revealFront < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Idle: every triangle breathes a little out of step, and a band of light
  // crosses on the slant every few seconds.
  float breath = 0.055 * sin(uTime * 0.7 + id * 6.2831);
  float band = fract(uTime * 0.085) * 1.9 - 0.45;
  float sweep = 0.22 * (1.0 - smoothstep(0.0, 0.07, abs(n.x * 0.75 + n.y * 0.25 - band)));

  // Outside the field there is no picture, so the pointer's own light picks
  // the level: uneven, like the dissolve, and kept to the two dimmest levels,
  // because the page's text sits straight on top of it.
  float lum = mix(near * id * 0.38, s.x, inField);
  // A glyph is either lit or not, so only what is lit takes the light.
  float lit = mix(1.0, step(0.05, lum), kind);
  lum = clamp(lum + (breath + sweep) * lit * inField + near * 0.22 * inField, 0.0, 1.0);

  float level = floor(lum * 4.999);
  vec3 colour = uLevel0;
  colour = mix(colour, uLevel1, step(1.0, level));
  colour = mix(colour, uLevel2, step(2.0, level));
  colour = mix(colour, uLevel3, step(3.0, level));
  colour = mix(colour, uLevel4, step(4.0, level));

  // Triangles shrink to nothing at either front and grow back behind it.
  float size = smoothstep(0.0, 0.07, abs(mixFront)) * smoothstep(0.0, 0.09, revealFront);
  float inset = uGap + (1.0 - size) * uCell * ROW / 3.0;
  float distanceToEdge = min(bary.x, min(bary.y, bary.z)) * uCell * ROW;
  float alpha = clamp(distanceToEdge - inset + 0.5, 0.0, 1.0);

  gl_FragColor = vec4(colour * alpha, alpha);
}
`;
