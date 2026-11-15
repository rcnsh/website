import { LOGO_POLYGONS, LOGO_VIEWBOX } from "../logo.ts";
import { COVER_EVENT, currentCover } from "../lattice-source.ts";
import { liveUpdates, motionReduced, onPrefChange } from "../prefs.ts";
import { placeCover, placeMark, type Rect } from "./geometry.ts";
import { FRAGMENT, VERTEX } from "./shader.ts";

/**
 * The lattice field: one canvas fixed behind every page, drawing a picture on
 * the triangle grid the mark is built from. A page names where and what with
 * `data-lattice` on one element: `cover` (what is playing, else the mark),
 * `mark`, `text:…`, or `svg:<selector>` for an inline SVG somewhere on the
 * page, whose shapes say how bright they are with `data-level` (0 to 4). Moving between pages swaps the picture in one sweep.
 *
 * This is the site's only animation frame loop. It stops while the field is
 * off screen or the tab is hidden, and holds one still frame under reduced
 * motion or with live updates off. A moving pointer uncovers the lattice
 * anywhere on the page, and that too stops soon after the pointer does.
 */

type Source = { texture: WebGLTexture; kind: 0 | 1; rect: Rect; key: string };

const CELL_WIDE = 24;
const CELL_NARROW = 17;
/** Title blocks: fine enough that the mark fits twice over beside a heading. */
const CELL_SMALL = 13;
/** A field this narrow (an inner page's title block) takes the small cell. */
const SMALL_FIELD = 900;
const NARROW_BELOW = 768;
const MAX_PIXEL_RATIO = 1.5;

/** How long the lattice stays uncovered after the pointer last moved. */
const POINTER_LINGER_MS = 900;

const REVEAL_SECONDS = 1.5;
const MIX_SECONDS = 1.25;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 4;

/** `#rrggbb` to linear-ish 0..1 triples; the palette is all six-digit hex. */
function hex(value: string): [number, number, number] {
  const n = Number.parseInt(value.trim().slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const blend = (a: number[], b: number[], t: number) =>
  a.map((channel, index) => channel + (b[index]! - channel) * t) as [number, number, number];

/** A glyph picture: white where it is lit, alpha where it is at all. */
function drawMark(): HTMLCanvasElement {
  const [minX, minY, width, height] = LOGO_VIEWBOX.split(" ").map(Number) as [number, number, number, number];
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round((1024 * height) / width);
  const context = canvas.getContext("2d")!;
  const scale = canvas.width / width;
  // The indigo half sits at the top level and the blue half one below, the
  // order the mark's own two tones run in.
  const tones = ["#ffffff", "#b4b4b4"];
  LOGO_POLYGONS.forEach((polygon, index) => {
    const points = polygon.points.split(" ").map(Number);
    context.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      const x = (points[i]! - minX) * scale;
      const y = (points[i + 1]! - minY) * scale;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = tones[index] ?? "#ffffff";
    context.fill();
  });
  return canvas;
}

function drawText(text: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 420;
  const context = canvas.getContext("2d")!;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace";
  context.font = `700 440px ${family}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 24, canvas.width);
  return canvas;
}

/** Shrunk first, so one read at a triangle's centre is the average under it. */
function drawCover(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Stretch the cover's own range across all five levels, or a dark sleeve
  // draws as one flat tone.
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  let low = 255;
  let high = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    if (lum < low) low = lum;
    if (lum > high) high = lum;
  }
  const range = Math.max(high - low, 1);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    const stretched = Math.round(((lum - low) / range) * 255);
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * An inline SVG as a picture: shapes only, each filled the grey of its
 * `data-level`, so the page's own colours and strokes never come into it.
 */
function svgPicture(svg: SVGSVGElement): string {
  const shapes = [...svg.querySelectorAll<SVGElement>("path, circle, rect, polygon")]
    .map((shape) => {
      const level = Number(shape.dataset.level ?? 4);
      const grey = Math.round(((level + 0.5) / 5) * 255);
      const copy = shape.cloneNode(false) as SVGElement;
      for (const name of ["class", "style", "data-level"]) copy.removeAttribute(name);
      copy.setAttribute("fill", `rgb(${grey},${grey},${grey})`);
      return copy.outerHTML;
    })
    .join("");
  const viewBox = svg.getAttribute("viewBox") ?? "0 0 100 100";
  const [, , width, height] = viewBox.split(" ").map(Number);
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${shapes}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The pixels are read back into a texture, which a tainted image refuses.
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`lattice: could not load ${url}`));
    image.src = url;
  });
}

export function startLattice(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return;

  const textureOf = (picture: TexImageSource) => {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  };

  const textures = new Map<string, WebGLTexture>();
  /** Width over height of each `svg:` picture, for placing it. */
  const aspects = new Map<string, number>();

  /**
   * Everything the context owns: the program, its uniforms and the mark.
   * Run at start, and again when a lost context comes back with none of it.
   */
  const build = () => {
    const compile = (type: number, text: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);

    // The same five levels as the contribution graph (Contributions.astro).
    const style = getComputedStyle(document.documentElement);
    const raised = hex(style.getPropertyValue("--color-raised"));
    const deep = hex(style.getPropertyValue("--color-brand-deep"));
    const brand = hex(style.getPropertyValue("--color-brand"));
    [raised, blend(raised, deep, 0.4), blend(raised, deep, 0.65), deep, brand].forEach((colour, level) => {
      gl.uniform3fv(uniform(`uLevel${level}`), colour);
    });

    const mark = textureOf(drawMark());
    textures.clear();
    textures.set("mark", mark);

    return {
      mark,
      locations: {
        resolution: uniform("uResolution"),
        field: uniform("uField"),
        cell: uniform("uCell"),
        gap: uniform("uGap"),
        time: uniform("uTime"),
        reveal: uniform("uReveal"),
        mix: uniform("uMix"),
        fade: uniform("uFade"),
        narrow: uniform("uNarrow"),
        pointer: uniform("uPointer"),
        from: uniform("uFrom"),
        to: uniform("uTo"),
        fromRect: uniform("uFromRect"),
        toRect: uniform("uToRect"),
        fromKind: uniform("uFromKind"),
        toKind: uniform("uToKind"),
      },
    };
  };

  const built = build();
  if (!built) return;
  let { locations, mark: markTexture } = built;
  /** The browser took the context away; nothing can be drawn until it is back. */
  let lost = false;

  let host: HTMLElement | null = null;
  let want = "mark";
  let from: Source = { texture: markTexture, kind: 1, rect: { x: 0, y: 0, w: 1, h: 1 }, key: "mark" };
  let to: Source = from;
  let mixStarted = Number.NEGATIVE_INFINITY;
  let revealStarted = performance.now();
  let frame = 0;
  let visible = false;
  let ratio = 1;
  let narrow = false;
  let fieldSize = { w: 0, h: 0 };
  const pointer = { x: 0, y: 0, strength: 0, target: 0, tx: 0, ty: 0, moved: Number.NEGATIVE_INFINITY };

  const still = () => motionReduced() || !liveUpdates();
  /** A title band or block, as against the home page's full-screen field. */
  const smallField = () => fieldSize.h < 520 * ratio;
  /** A block inside the page frame (a post's header), not a full-bleed band. */
  const boxed = () => narrow || fieldSize.w < SMALL_FIELD * ratio;
  const cellSize = () => (smallField() ? CELL_SMALL : narrow ? CELL_NARROW : CELL_WIDE) * ratio;

  /** Where a picture sits in the field, in device pixels. */
  const place = (key: string): Rect => {
    const cell = cellSize();
    if (key.startsWith("cover:")) return placeCover(fieldSize, narrow && !smallField(), smallField());
    if (key.startsWith("text:")) {
      // Across the top of its block, above the heading.
      const w = Math.min(fieldSize.w - 56 * ratio, 560 * ratio);
      return { x: 28 * ratio, y: 50 * ratio, w, h: (w * 420) / 1024 };
    }
    // A full-bleed field keeps its picture to the page frame.
    const frame = 1184 * ratio;
    const inset = Math.max((fieldSize.w - frame) / 2, 0) + 22 * ratio;
    if (key.startsWith("svg:")) {
      const aspect = aspects.get(key) ?? 2;
      const w = narrow ? fieldSize.w * 0.56 : Math.min((fieldSize.w - inset * 2) * 0.5, fieldSize.h * 0.84 * aspect);
      const h = w / aspect;
      return { x: fieldSize.w - (narrow ? 14 * ratio : inset) - w, y: narrow ? 14 * ratio : (fieldSize.h - h) / 2, w, h };
    }
    // A phone's home field has the room above the name; a title block does not.
    if (narrow && fieldSize.h > 520 * ratio)
      return placeMark(fieldSize, cell, { share: 1, alignX: 0.5, alignY: 0, inset: 22 * ratio });
    if (smallField() && boxed())
      return placeMark(fieldSize, cell, {
        share: narrow ? 0.5 : 0.62,
        alignX: 1,
        alignY: 0,
        inset: (narrow ? 16 : 24) * ratio,
        maxScale: 2,
      });
    return placeMark(fieldSize, cell, { share: smallField() ? 0.36 : 0.44, alignX: 1, alignY: 0.46, inset });
  };

  const resize = () => {
    ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    narrow = window.innerWidth < NARROW_BELOW;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  /** Swap to another picture with the sweep, or at once when nothing is drawn yet. */
  const show = (key: string, texture: WebGLTexture) => {
    if (to.key === key) return;
    from = to;
    to = { texture, kind: key.startsWith("cover:") ? 0 : 1, rect: place(key), key };
    mixStarted = still() ? Number.NEGATIVE_INFINITY : performance.now();
    wake();
  };

  /** Resolve what the page asks for into a texture, loading a cover if need be. */
  const resolve = () => {
    const asked = host?.dataset.lattice || "mark";
    const cover = asked === "cover" ? currentCover() : null;
    const drawing = asked.startsWith("svg:") ? document.querySelector<SVGSVGElement>(asked.slice(4)) : null;
    const key = cover
      ? `cover:${cover.image}`
      : asked.startsWith("text:")
        ? asked
        : drawing
          ? // Keyed on every shape's level, so it is redrawn whenever what it
            // shows changes: a signature from a new country, or one deleted.
            `${asked}:${[...drawing.querySelectorAll<SVGElement>("[data-level]")].map((shape) => shape.dataset.level).join("")}`
          : "mark";
    want = key;

    // An island's drawing lands after the page does: ask again when it has.
    pending?.disconnect();
    if (asked.startsWith("svg:") && !drawing) {
      pending = new MutationObserver(() => {
        if (document.querySelector(asked.slice(4))) resolve();
      });
      pending.observe(document.body, { childList: true, subtree: true });
    }

    const caption = document.querySelector<HTMLElement>("[data-lattice-caption]");
    if (caption) caption.textContent = cover ? cover.label : "the rcn mark";

    const ready = textures.get(key);
    if (ready) return show(key, ready);

    if (key.startsWith("text:")) {
      const texture = textureOf(drawText(key.slice(5)));
      textures.set(key, texture);
      return show(key, texture);
    }

    // The mark stands in until the picture arrives.
    show("mark", markTexture);
    if (!cover && !drawing) return;
    loadImage(cover ? cover.image : svgPicture(drawing!))
      .then((image) => {
        if (!cover) aspects.set(key, image.naturalWidth / Math.max(image.naturalHeight, 1));
        const texture = textureOf(cover ? drawCover(image) : image);
        textures.set(key, texture);
        if (want === key) show(key, texture);
      })
      .catch(() => {
        // No cover to draw: the mark stays.
      });
  };

  const draw = (now: number) => {
    frame = 0;
    if (!host || document.hidden || lost) return;

    // The pointer uncovers the lattice anywhere on the page, for as long as
    // it keeps moving. At rest off the field there is nothing to draw, so
    // the loop stops rather than run for the whole visit.
    pointer.target = now - pointer.moved < POINTER_LINGER_MS ? 1 : 0;
    const uncovering = !still() && (pointer.target > 0 || pointer.strength > 0.01);
    if (!visible && !uncovering) {
      pointer.strength = 0;
      gl.scissor(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    const box = host.getBoundingClientRect();
    const field = { x: box.left * ratio, y: box.top * ratio, w: box.width * ratio, h: box.height * ratio };
    if (field.w !== fieldSize.w || field.h !== fieldSize.h) {
      fieldSize = { w: field.w, h: field.h };
      from = { ...from, rect: place(from.key) };
      to = { ...to, rect: place(to.key) };
    }

    const frozen = still();
    const mix = frozen ? 1 : Math.min((now - mixStarted) / 1000 / MIX_SECONDS, 1);
    const reveal = frozen ? 1 : Math.min((now - revealStarted) / 1000 / REVEAL_SECONDS, 1);

    pointer.strength += (pointer.target - pointer.strength) * 0.08;
    pointer.x += (pointer.tx - pointer.x) * 0.16;
    pointer.y += (pointer.ty - pointer.y) * 0.16;

    // Shade only the field's rows, or the whole viewport while the pointer
    // is uncovering the lattice beyond it.
    const top = uncovering ? 0 : Math.max(0, Math.floor(field.y));
    const bottom = uncovering ? canvas.height : Math.min(canvas.height, Math.ceil(field.y + field.h));
    gl.scissor(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (bottom > top) {
      gl.scissor(0, canvas.height - bottom, canvas.width, bottom - top);

      const cell = cellSize();
      gl.uniform2f(locations.resolution, canvas.width, canvas.height);
      gl.uniform4f(locations.field, field.x, field.y, field.w, field.h);
      gl.uniform1f(locations.cell, cell);
      gl.uniform1f(locations.gap, 1.1 * ratio);
      gl.uniform1f(locations.time, frozen ? 0 : now / 1000);
      gl.uniform1f(locations.reveal, easeOut(reveal));
      gl.uniform1f(locations.mix, easeInOut(mix));
      gl.uniform1f(locations.fade, Math.min(Math.max(-box.top / Math.max(box.height, 1), 0), 1) * 0.85);
      gl.uniform1f(locations.narrow, narrow && !smallField() ? 1 : 0);
      gl.uniform3f(locations.pointer, pointer.x * ratio, pointer.y * ratio, frozen ? 0 : pointer.strength);
      gl.uniform4f(locations.fromRect, from.rect.x, from.rect.y, from.rect.w, from.rect.h);
      gl.uniform4f(locations.toRect, to.rect.x, to.rect.y, to.rect.w, to.rect.h);
      gl.uniform1f(locations.fromKind, from.kind);
      gl.uniform1f(locations.toKind, to.kind);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      gl.uniform1i(locations.from, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, to.texture);
      gl.uniform1i(locations.to, 1);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // A still field has nothing to animate; scroll and resize wake it.
    if (!frozen) frame = requestAnimationFrame(draw);
  };

  function wake() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  let pending: MutationObserver | null = null;
  let watching: IntersectionObserver | null = null;
  let arriving: MutationObserver | null = null;

  /** Bind to the page on screen. Called at once and after every soft navigation. */
  const bind = () => {
    watching?.disconnect();
    host = document.querySelector<HTMLElement>("[data-lattice]");
    arriving?.disconnect();
    if (!host) {
      visible = false;
      gl.scissor(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // A server island's title block (/files) lands after this ran.
      arriving = new MutationObserver(() => {
        if (document.querySelector("[data-lattice]")) bind();
      });
      arriving.observe(document.body, { childList: true, subtree: true });
      return;
    }
    fieldSize = { w: 0, h: 0 };
    watching = new IntersectionObserver(([entry]) => {
      // A server island replaced its fallback, host included (/files).
      if (host && !host.isConnected) return bind();
      visible = Boolean(entry?.isIntersecting);
      if (visible) wake();
    });
    watching.observe(host);
    resolve();
  };

  resize();
  window.addEventListener("resize", () => {
    resize();
    fieldSize = { w: 0, h: 0 };
    wake();
  });
  window.addEventListener("scroll", wake, { passive: true });
  document.addEventListener("visibilitychange", wake);
  document.addEventListener(COVER_EVENT, resolve);
  document.addEventListener("astro:after-swap", bind);
  onPrefChange("motion", wake);
  onPrefChange("live", wake);

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      pointer.moved = performance.now();
      wake();
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.moved = Number.NEGATIVE_INFINITY;
  });

  // A lost context comes back empty, and only if the loss was acknowledged.
  // The canvas is persisted, so without this every later page inherits a
  // dead one.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    const rebuilt = build();
    if (!rebuilt) return;
    ({ locations, mark: markTexture } = rebuilt);
    lost = false;
    from = to = { texture: markTexture, kind: 1, rect: place("mark"), key: "mark" };
    resize();
    resolve();
    wake();
  });

  revealStarted = performance.now();
  bind();
}
