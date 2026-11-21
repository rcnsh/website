import { REDUCED_MOTION_QUERY, resolveMotion } from "./motion.ts";

export const MOTION_BOOTSTRAP = `(() => {
  let stored = null;
  try {
    stored = localStorage.getItem("rcn:motion");
  } catch {}
  document.documentElement.dataset.motion = (${resolveMotion.toString()})(stored, matchMedia(${JSON.stringify(REDUCED_MOTION_QUERY)}).matches);
})();`;

export const INLINE_SCRIPTS = [MOTION_BOOTSTRAP];
