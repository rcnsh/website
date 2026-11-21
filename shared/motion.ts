export type Motion = "reduce" | "full";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const resolveMotion: (stored: string | null, prefersReduce: boolean) => Motion = (stored, prefersReduce) => stored === "reduce" || stored === "full" ? stored : prefersReduce ? "reduce" : "full";
