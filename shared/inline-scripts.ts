import { REDUCED_MOTION_QUERY } from "./motion.ts";

export const MOTION_BOOTSTRAP = `(() => {
  let stored = null;
  try {
    stored = localStorage.getItem("rcn:motion");
  } catch {}
  const prefersReduce = matchMedia(${JSON.stringify(REDUCED_MOTION_QUERY)}).matches;
  document.documentElement.dataset.motion =
    stored === "reduce" || stored === "full" ? stored : prefersReduce ? "reduce" : "full";
})();`;

export const INLINE_SCRIPTS = [MOTION_BOOTSTRAP];
