# 0013. Cookies are always Secure and carry the __Host- prefix

`src/lib/cookies.ts` sets `COOKIE_SECURE` to `!import.meta.env?.DEV`: Secure unconditionally outside dev, not derived from the request scheme. A first-ever visitor landing on `http://` would otherwise get a cookie without Secure and send it in the clear, and HSTS cannot help that first navigation. The optional chaining exists only so `node --test`, which has no `import.meta.env`, can load the module.

When Secure, cookie names get the `__Host-` prefix (`COOKIE_PREFIX`), which stops any other `*.rcn.sh` host from setting them for rcn.sh, where a planted state cookie would sign a visitor in as the planter. Browsers refuse the prefix without Secure, so dev uses bare names. A deletion must also pass `secure`, or the browser ignores it; `src/lib/session-cookie.ts` and `src/lib/owner-hint.ts` do.
