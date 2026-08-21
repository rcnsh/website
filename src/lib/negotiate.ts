/**
 * Accept-header content negotiation, to the letter of RFC 9110 §12.5.1 and the
 * conformance rules at https://acceptmarkdown.com.
 *
 * The point is that one URL serves two representations: HTML to a browser,
 * Markdown to an agent. Getting that right needs three things that are easy to
 * skip — q-values ranked properly, `Vary: Accept` on every negotiated response
 * so a CDN can't hand the cached HTML to an agent, and a `406` when the client
 * genuinely accepts neither.
 *
 * Everything here is pure, so the interesting half lives in negotiate.test.ts
 * rather than in a deployed Worker.
 */

/** In preference order — the first entry is what a client with no Accept gets. */
export const PRODUCES = ["text/html", "text/markdown"] as const;

export type Produced = (typeof PRODUCES)[number];

export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

interface AcceptEntry {
  type: string;
  q: number;
  /**
   * How narrow the range is: a full wildcard scores 0, a type wildcard such as
   * `text/<star>` scores 1, and a fully named type scores 2. Higher wins
   * outright, whatever the q-values say.
   */
  specificity: number;
}

/**
 * Splits an Accept header into ranked entries. Client order is preserved
 * because position breaks ties that q-value and specificity leave open.
 *
 * Malformed parameters are ignored rather than rejected — a header is a hint,
 * and half of one is still worth reading.
 */
export function parseAccept(header: string): AcceptEntry[] {
  return header
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const parts = raw.split(";").map((part) => part.trim());
      const type = (parts[0] ?? "").toLowerCase();

      let q = 1;
      for (const param of parts.slice(1)) {
        const [name, value] = param.split("=").map((piece) => piece.trim());
        if (name?.toLowerCase() !== "q") continue;
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) q = Math.max(0, Math.min(1, parsed));
      }

      const specificity = type === "*/*" ? 0 : type.endsWith("/*") ? 1 : 2;
      return { type, q, specificity };
    })
    .filter((entry) => entry.type.includes("/"));
}

function matches(entry: AcceptEntry, candidate: string): boolean {
  if (entry.type === "*/*") return true;
  if (entry.type.endsWith("/*")) {
    return candidate.startsWith(entry.type.slice(0, -1));
  }
  return entry.type === candidate;
}

/**
 * Picks the representation to send, or `null` when the client accepts none of
 * them — the one case that earns a 406.
 *
 * A missing or unparseable header means "no constraint", not "nothing works",
 * so it falls through to the default rather than erroring.
 */
export function preferredType(header: string | null | undefined): Produced | null {
  if (!header?.trim()) return PRODUCES[0];

  const entries = parseAccept(header);
  if (entries.length === 0) return PRODUCES[0];

  let best: Produced | null = null;
  let bestQ = -1;
  let bestPosition = Number.POSITIVE_INFINITY;

  for (const candidate of PRODUCES) {
    /*
      Per §12.5.1 the most specific matching range decides, whatever its
      q-value — so an Accept of `text/html;q=0` plus a bare wildcard rejects
      HTML rather than letting the wildcard resurrect it.
    */
    let matched: AcceptEntry | null = null;
    let matchedPosition = Number.POSITIVE_INFINITY;

    for (const [index, entry] of entries.entries()) {
      if (!matches(entry, candidate)) continue;
      if (matched === null || entry.specificity > matched.specificity) {
        matched = entry;
        matchedPosition = index;
      }
    }

    // q=0 is an explicit refusal of this type, not a weak preference.
    if (matched === null || matched.q <= 0) continue;

    // Across candidates: highest q wins, then whichever the client named first.
    if (
      matched.q > bestQ ||
      (matched.q === bestQ && matchedPosition < bestPosition)
    ) {
      bestQ = matched.q;
      bestPosition = matchedPosition;
      best = candidate;
    }
  }

  return best;
}

/**
 * Adds `Accept` to Vary without clobbering what's already there, and without
 * listing it twice if a downstream handler got there first.
 */
export function appendVaryAccept(headers: Headers): void {
  const existing = headers.get("Vary");

  if (!existing) {
    headers.set("Vary", "Accept");
    return;
  }

  // `Vary: *` means "vary on everything"; narrowing it would be a lie.
  const tokens = existing.split(",").map((token) => token.trim().toLowerCase());
  if (tokens.includes("accept") || tokens.includes("*")) return;

  headers.set("Vary", `${existing}, Accept`);
}

/**
 * The body RFC 9110 §15.5.7 asks for: what this URL can produce, and what was
 * asked for, so the client can retry without guessing.
 */
export function notAcceptableResponse(accept: string | null): Response {
  const body = [
    "# 406 Not Acceptable",
    "",
    "This resource is available in:",
    ...PRODUCES.map((type) => `- ${type}`),
    "",
    `You requested: ${accept?.trim() || "(no Accept header)"}`,
    "",
  ].join("\n");

  return new Response(body, {
    status: 406,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Accept is request-specific: the same URL is a 200 for the next client.
      "Cache-Control": "no-store",
      Vary: "Accept",
    },
  });
}

/** A negotiated Markdown response, with the Vary a shared cache needs. */
export function markdownResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": MARKDOWN_CONTENT_TYPE,
      Vary: "Accept",
    },
  });
}

/**
 * The decision the middleware applies on the way out, kept here so it can be
 * tested without a Worker.
 *
 * It only ever touches a response that came back as HTML — the default
 * representation, and so the only one negotiation has anything to say about:
 *
 * - HTML, and the client accepts neither form → 406. This is the one place a
 *   406 is honest, because we produced the default and it was refused.
 * - HTML, otherwise → add `Vary: Accept`, or a shared cache will hand this
 *   copy to the next agent that asks for Markdown.
 * - anything else → untouched. JSON endpoints (including /mcp, whose clients
 *   send `Accept: application/json, text/event-stream`) must not be 406'd for
 *   not wanting HTML, and a route that already answered in Markdown gave the
 *   client what it asked for and set its own Vary on the way out.
 */
export function finaliseNegotiation(
  response: Response,
  accept: string | null,
  chosen: Produced | null,
): Response {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("text/html")) return response;

  if (chosen === null) return notAcceptableResponse(accept);

  appendVaryAccept(response.headers);
  return response;
}
