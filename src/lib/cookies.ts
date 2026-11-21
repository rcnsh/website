export const COOKIE_SECURE = !import.meta.env?.DEV;

export const COOKIE_PREFIX = COOKIE_SECURE ? "__Host-" : "";
