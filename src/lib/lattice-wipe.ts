const SIDE = 16;
export const COVER_CLOSE_MS = 260;
const COVER_OPEN_MS = 460;

const VERTEX = `
attribute vec2 aCorner;
void main() {
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
uniform float uHeight;
uniform float uSide;
uniform float uCovered;
uniform vec3 uGround;

float chance(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 at = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y);
  float rise = uSide * 0.8660254;
  float row = floor(at.y / rise);
  float down = fract(at.y / rise);
  float across = at.x / (uSide * 0.5);
  // The slanted edges in a row sit on every other whole number; which ones
  // depends on the row. Two of them bound each triangle.
  float odd = 1.0 - mod(row, 2.0);
  float col = floor((across + down - odd) * 0.5) + floor((across - down - odd) * 0.5) + odd;
  if (chance(vec2(row, col)) >= uCovered) discard;
  gl_FragColor = vec4(uGround, 1.0);
}`;

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.trim().replace("#", ""), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export interface LatticeCover {
  close: () => void;
  open: () => void;
  clear: () => void;
}

export function latticeCover(): LatticeCover | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true });
  if (!gl) return null;

  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, "aCorner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const at = { height: uniform("uHeight"), side: uniform("uSide"), covered: uniform("uCovered"), ground: uniform("uGround") };

  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    left: "0",
    top: "var(--header-h)",
    width: "100%",
    height: "calc(100% - var(--header-h))",
    zIndex: "40",
    pointerEvents: "none",
    display: "none",
  });
  document.documentElement.appendChild(canvas);

  let frame = 0;
  let covered = 0;

  const show = () => {
    canvas.style.display = "block";
    const scale = Math.min(devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * scale);
    canvas.height = Math.round(box.height * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(at.height, canvas.height);
    gl.uniform1f(at.side, SIDE * scale);
    gl.uniform3fv(at.ground, rgb(getComputedStyle(document.documentElement).getPropertyValue("--color-base")));
  };

  const draw = (share: number) => {
    covered = share;
    gl.uniform1f(at.covered, share);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const clear = () => {
    cancelAnimationFrame(frame);
    covered = 0;
    canvas.style.display = "none";
  };

  const run = (ms: number, closing: boolean) => {
    cancelAnimationFrame(frame);
    const from = covered;
    if (!closing && from === 0) return clear();
    show();
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - began) / ms));
      draw(closing ? from + (1 - from) * t * t : from * (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
      else if (!closing) clear();
    };
    frame = requestAnimationFrame(step);
  };

  return { close: () => run(COVER_CLOSE_MS, true), open: () => run(COVER_OPEN_MS, false), clear };
}
