import { triangleTaps } from "./geometry.ts";

/**
 * The field's two programs. One full-screen triangle; the fragment shader
 * finds which lattice triangle a pixel is in, reads the source picture under
 * that triangle (a glyph at its centre, a cover averaged over its area), and
 * paints the whole triangle one of five levels, the same five the
 * contribution graph uses.
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

/** Each side cut in three: nine equal triangles, one read at each centroid. */
const TAPS = triangleTaps(3);
const tapReads = TAPS.map(
  ([a, b, c]) => `  sum += texture2D(tex, clamp(texelAt(rect, a * ${a.toFixed(6)} + b * ${b.toFixed(6)} + c * ${c.toFixed(6)}), 0.0, 1.0)).rgb;`,
).join("\n");

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

// Lattice coordinates to px within the field.
vec2 latticePx(vec2 uv) {
  return vec2((uv.x - 0.5 * uv.y) * uCell, uv.y * uCell * ROW);
}

// Where a cover dissolves, across its square (uv). Wide: gone left of
// GONE_X, which clears the home name's last letter at 1440px (it reaches
// 0.18), solid from SOLID_X. Phone: solid down to SOLID_Y, gone by GONE_Y,
// above the name. RANK is how much brightness, against chance, decides
// which triangles in the band survive.
const float COVER_GONE_X = 0.2;
const float COVER_SOLID_X = 0.47;
const float COVER_SOLID_Y = 0.5;
const float COVER_GONE_Y = 0.7;
const float COVER_RANK = 0.45;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 texelAt(vec4 rect, vec2 point) {
  return (point - rect.xy) / rect.zw;
}

// The cover's mean over the triangle with corners a, b, c (px).
float coverMean(sampler2D tex, vec4 rect, vec2 a, vec2 b, vec2 c) {
  vec3 sum = vec3(0.0);
${tapReads}
  return dot(sum / ${TAPS.length.toFixed(1)}, vec3(0.299, 0.587, 0.114));
}

// An ordered threshold in 0..1 for each triangle, from a 4x4 Bayer matrix on
// the lattice's cells with the up and down triangles of a cell half a cycle
// apart: 32 thresholds, spread as evenly as the grid allows. Fixed per
// triangle, so the picture never shimmers.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float threshold(vec2 cell, float upper) {
  float bayer4 = bayer2(0.5 * cell) * 0.25 + bayer2(cell);
  return fract(bayer4 * 0.5 + upper * 0.5);
}

// x: luminance 0..1, y: how likely the triangle is to be drawn at all.
vec2 source(sampler2D tex, vec4 rect, float kind, vec2 centre, vec2 c0, vec2 c1, vec2 c2, vec2 field) {
  vec2 uv = texelAt(rect, centre);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);

  if (kind > 0.5) {
    // A glyph's edges lie on triangle edges, so its centre says it all: its
    // own triangles always, and a thinning scatter around it.
    vec4 texel = texture2D(tex, clamp(uv, 0.0, 1.0)) * inside;
    float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
    vec2 away = (centre - (rect.xy + rect.zw * 0.5)) / (rect.zw * vec2(0.9, 1.9));
    float ambient = 0.3 * (1.0 - smoothstep(0.25, 1.0, length(away)));
    return vec2(lum, mix(ambient, 1.0, step(0.5, texel.a)));
  }

  // A cover: the mean of what the triangle covers, so one stray pixel at its
  // centre cannot decide it. Solid over most of its square, dissolving in a
  // short band that ends before the text starts. On a phone it stays inside
  // its own square and thins out down it, clear of the name below.
  float lum = coverMean(tex, rect, c0, c1, c2) * inside;
  vec2 n = centre / field;
  float wide = clamp((uv.x - COVER_GONE_X) / (COVER_SOLID_X - COVER_GONE_X), 0.0, 1.0) * (1.0 - smoothstep(0.9, 1.0, n.y)) * mix(0.4, 1.0, inside);
  float tall = (1.0 - smoothstep(COVER_SOLID_Y, COVER_GONE_Y, uv.y)) * inside;
  float band = mix(wide, tall, uNarrow);

  // Inside the band the darkest triangles go first, so the picture's bright
  // shapes are the last of it. main() draws a triangle when its hash id2 is
  // under the presence, so this is "drawn when mix(id2, 1 - lum, RANK) <
  // band", solved for id2: the hash keeps the edge ragged, not a contour.
  float ranked = clamp((band - COVER_RANK * (1.0 - lum)) / (1.0 - COVER_RANK), 0.0, 1.0);
  return vec2(lum, mix(band, ranked, inside));
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
  vec2 centre = latticePx(centreUv);
  vec2 c0 = latticePx(cell);
  vec2 c1 = latticePx(cell + mix(vec2(0.0, 1.0), vec2(1.0, 0.0), upper));
  vec2 c2 = latticePx(cell + 1.0);

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
  vec2 a = source(uFrom, uFromRect, uFromKind, centre, c0, c1, c2, uField.zw);
  vec2 b = source(uTo, uToRect, uToKind, centre, c0, c1, c2, uField.zw);
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
  // A cover's breath goes into its colour instead (below): added here it is
  // a moving random dither that scrambles the ordered one.
  float cover = (1.0 - kind) * inField;
  lum = clamp(lum + (breath * (1.0 - cover) + sweep) * lit * inField + near * 0.22 * inField, 0.0, 1.0);

  // A cover is dithered, so five levels show the tones between them and a
  // gradient reads as one instead of flat bands; a glyph's levels are exact.
  float dither = (threshold(cell, upper) - 0.5) * cover;
  float level = clamp(floor(lum * 5.0 + dither), 0.0, 4.0);
  level = mix(level, floor(lum * 4.999), kind);
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

  colour *= 1.0 + breath * 1.8 * cover;
  gl_FragColor = vec4(colour * alpha, alpha);
}
`;
