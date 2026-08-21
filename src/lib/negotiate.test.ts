import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendVaryAccept,
  finaliseNegotiation,
  markdownResponse,
  notAcceptableResponse,
  parseAccept,
  preferredType,
} from "./negotiate.ts";

/*
  The four things acceptmarkdown.com actually checks: Markdown is served for
  `Accept: text/markdown`, `Vary: Accept` is set, unsatisfiable requests get a
  406, and q-values are honoured.
*/

test("no constraint falls through to HTML", () => {
  // A missing header means "anything", not "nothing" — 406 here would be a bug.
  assert.equal(preferredType(null), "text/html");
  assert.equal(preferredType(undefined), "text/html");
  assert.equal(preferredType(""), "text/html");
  assert.equal(preferredType("   "), "text/html");
  assert.equal(preferredType("*/*"), "text/html");
  assert.equal(preferredType("text/*"), "text/html");
});

test("an explicit markdown request gets markdown", () => {
  assert.equal(preferredType("text/markdown"), "text/markdown");
  assert.equal(
    preferredType("text/markdown; charset=utf-8"),
    "text/markdown",
  );
});

test("a browser's Accept header still gets HTML", () => {
  const chrome =
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8";
  assert.equal(preferredType(chrome), "text/html");
});

test("q-values rank the candidates", () => {
  assert.equal(
    preferredType("text/html;q=0.9, text/markdown;q=1.0"),
    "text/markdown",
  );
  assert.equal(
    preferredType("text/markdown;q=0.5, text/html;q=0.9"),
    "text/html",
  );
  assert.equal(
    preferredType("text/markdown;q=0.8, text/html;q=0.8"),
    "text/markdown",
    "equal q falls back to the order the client listed them in",
  );
});

test("q=0 is a refusal, and a wildcard cannot undo it", () => {
  // RFC 9110 §12.5.1: the most specific range wins regardless of q.
  assert.equal(preferredType("text/html;q=0, */*"), "text/markdown");
  assert.equal(preferredType("text/markdown;q=0, */*"), "text/html");
  assert.equal(preferredType("text/html;q=0, text/markdown;q=0"), null);
});

test("nothing we can produce is acceptable", () => {
  assert.equal(preferredType("application/pdf"), null);
  assert.equal(preferredType("image/png, application/json"), null);
});

test("malformed entries are skipped, not fatal", () => {
  assert.equal(preferredType("text/markdown;q=banana"), "text/markdown");
  assert.equal(preferredType(",,, text/markdown ,,,"), "text/markdown");
  assert.equal(preferredType("garbage"), "text/html", "no '/' — ignored");
});

test("parseAccept clamps q into range and lowercases the type", () => {
  assert.deepEqual(parseAccept("TEXT/Markdown;q=5"), [
    { type: "text/markdown", q: 1, specificity: 2 },
  ]);
  assert.deepEqual(parseAccept("text/*;q=-1"), [
    { type: "text/*", q: 0, specificity: 1 },
  ]);
});

test("appendVaryAccept adds Accept exactly once", () => {
  const fresh = new Headers();
  appendVaryAccept(fresh);
  assert.equal(fresh.get("Vary"), "Accept");

  const existing = new Headers({ Vary: "Accept-Encoding" });
  appendVaryAccept(existing);
  assert.equal(existing.get("Vary"), "Accept-Encoding, Accept");

  appendVaryAccept(existing);
  assert.equal(
    existing.get("Vary"),
    "Accept-Encoding, Accept",
    "a second pass must not duplicate the token",
  );

  const cased = new Headers({ Vary: "accept, Accept-Encoding" });
  appendVaryAccept(cased);
  assert.equal(cased.get("Vary"), "accept, Accept-Encoding");
});

test("appendVaryAccept leaves Vary: * alone", () => {
  const wildcard = new Headers({ Vary: "*" });
  appendVaryAccept(wildcard);
  assert.equal(wildcard.get("Vary"), "*");
});

test("406 lists the representations and echoes the request", async () => {
  const response = notAcceptableResponse("application/pdf");

  assert.equal(response.status, 406);
  assert.equal(response.headers.get("Vary"), "Accept");
  assert.equal(response.headers.get("Cache-Control"), "no-store");

  const body = await response.text();
  assert.match(body, /text\/html/);
  assert.match(body, /text\/markdown/);
  assert.match(body, /You requested: application\/pdf/);
});

test("406 says so when there was no Accept header at all", async () => {
  const body = await notAcceptableResponse(null).text();
  assert.match(body, /\(no Accept header\)/);
});

test("markdownResponse carries the media type and Vary", async () => {
  const response = markdownResponse("# hello");

  assert.equal(
    response.headers.get("Content-Type"),
    "text/markdown; charset=utf-8",
  );
  assert.equal(response.headers.get("Vary"), "Accept");
  assert.equal(await response.text(), "# hello");
});

/* --- The middleware's decision ------------------------------------------- */

const html = (status = 200) =>
  new Response("<!doctype html>", {
    status,
    headers: { "Content-Type": "text/html" },
  });

const decide = (accept: string | null, response = html()) =>
  finaliseNegotiation(response, accept, preferredType(accept));

test("an HTML answer to a browser gets Vary: Accept", async () => {
  const response = decide("text/html,*/*;q=0.8");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Vary"), "Accept");
});

test("an HTML answer nobody can accept becomes a 406", async () => {
  const response = decide("application/pdf");

  assert.equal(response.status, 406);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
});

test("a 404 page still negotiates, and keeps its status", () => {
  assert.equal(decide("*/*", html(404)).status, 404);
  assert.equal(decide("application/pdf", html(404)).status, 406);
});

test("a JSON endpoint is never touched", () => {
  // /mcp clients send exactly this, and must not be 406'd for not wanting HTML.
  const rpc = new Response("{}", {
    headers: { "Content-Type": "application/json" },
  });
  const response = decide("application/json, text/event-stream", rpc);

  assert.equal(response, rpc, "the response object should pass straight through");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Vary"), null);
});

test("a route that already answered in Markdown is left as it was", () => {
  const already = markdownResponse("# hi");
  const response = decide("text/markdown", already);

  assert.equal(response, already);
  assert.equal(response.headers.get("Vary"), "Accept", "set by the route itself");
});

test("a feed is not dragged into the negotiation", () => {
  const feed = new Response("<rss/>", {
    headers: { "Content-Type": "application/rss+xml" },
  });

  assert.equal(decide("application/rss+xml", feed).status, 200);
  assert.equal(decide("application/pdf", feed).status, 200);
});

test("an existing Vary on an HTML response is extended, not replaced", () => {
  const response = decide(
    "*/*",
    new Response("<!doctype html>", {
      headers: { "Content-Type": "text/html", Vary: "Accept-Encoding" },
    }),
  );

  assert.equal(response.headers.get("Vary"), "Accept-Encoding, Accept");
});

test("a charset on the content type does not defeat the check", () => {
  const response = decide(
    "*/*",
    new Response("<!doctype html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  );

  assert.equal(response.headers.get("Vary"), "Accept");
});
