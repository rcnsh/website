/**
 * Unconditional outside dev, not derived from the request scheme: a first-ever
 * visitor landing on http:// would otherwise get a cookie without `Secure` and
 * send it in the clear. HSTS cannot help that first navigation. Optional
 * chaining only so node --test, which has no `import.meta.env`, can load it.
 */
export const COOKIE_SECURE = !import.meta.env?.DEV;

/**
 * `__Host-` stops any other *.rcn.sh host from setting these for rcn.sh: a
 * planted state cookie would sign a visitor in as the planter. Browsers refuse
 * the prefix without `Secure`, so dev keeps the bare names — and a deletion
 * must carry `secure` too, or it is ignored.
 */
export const COOKIE_PREFIX = COOKIE_SECURE ? "__Host-" : "";
