import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  directiveSources,
  inlineScripts,
  inlineStyles,
  metaPolicies,
  replaceMetaPolicy,
  unionPolicies,
} from "./csp-union.ts";

const page = (policy: string, body = "") =>
  `<html><head><meta http-equiv="content-security-policy" content="${policy}"></head><body>${body}</body></html>`;

describe("union", () => {
  test("each directive collects every page's sources once, in first-seen order", () => {
    const a = "script-src 'self' 'sha256-A' 'sha256-B'; style-src 'self' 'sha256-S'";
    const b = "script-src 'self' 'sha256-B' 'sha256-C'; style-src-attr 'unsafe-inline'";
    assert.equal(
      unionPolicies([a, b]),
      "script-src 'self' 'sha256-A' 'sha256-B' 'sha256-C'; style-src 'self' 'sha256-S'; style-src-attr 'unsafe-inline'",
    );
  });

  test("directive names are case-insensitive", () => {
    assert.equal(unionPolicies(["Script-Src 'a'", "script-src 'b'"]), "script-src 'a' 'b'");
  });

  test("reads one directive back", () => {
    assert.deepEqual(directiveSources("script-src 'self' 'x'; style-src 'y'", "style-src"), ["'y'"]);
    assert.equal(directiveSources("style-src 'y'", "script-src"), null);
  });
});

describe("meta tags", () => {
  test("found and replaced in place", () => {
    const html = page("script-src 'self'");
    assert.deepEqual(metaPolicies(html), ["script-src 'self'"]);
    const replaced = replaceMetaPolicy(html, "script-src 'self' 'sha256-X'");
    assert.deepEqual(metaPolicies(replaced), ["script-src 'self' 'sha256-X'"]);
    assert.ok(replaced.startsWith("<html><head><meta"));
  });

  test("a page without one has none", () => {
    assert.deepEqual(metaPolicies("<html><head></head></html>"), []);
  });
});

describe("inline scripts", () => {
  test("bodies the browser would run, byte for byte", () => {
    const body = [
      "<script>one()</script>",
      '<script type="module" data-astro-rerun>\n two()\n</script>',
      '<script type="module" src="/_astro/a.js"></script>',
      '<script type="application/ld+json">{"a":1}</script>',
      '<script src="/b.js" defer></script>',
    ].join("");
    assert.deepEqual(inlineScripts(page("", body)), ["one()", "\n two()\n"]);
  });

  test("an attribute that merely contains 'src' is not an external script", () => {
    assert.deepEqual(inlineScripts('<script data-srcset="x">three()</script>'), ["three()"]);
  });
});

test("inline styles, byte for byte", () => {
  assert.deepEqual(inlineStyles('<style>a{b:c}</style><style data-x="1">\n d{}</style>'), ["a{b:c}", "\n d{}"]);
});
