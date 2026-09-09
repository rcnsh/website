# Denial of wallet

The Workers Paid plan bills per request, per CPU millisecond, and per Durable
Object second. There is no spend cap behind it. So the interesting failure mode
for this site is not someone taking it down — it is someone leaving it up and
running the meter.

This is what the account is exposed to, what the repository does about it, and
what has to be done in the dashboard because code cannot express it.

## What actually costs money

Rates below are Workers Paid, September 2026.

| Surface | Billed as | Bounded by |
| --- | --- | --- |
| Prerendered pages, CSS, fonts, `/og/*` | Nothing. Static asset requests are free and unlimited | — |
| SSR routes and `/api/*` | $0.30/M requests over 10M, $0.02/M CPU-ms over 30M | `limits.cpu_ms` + `ratelimits`, both in `wrangler.jsonc` |
| `/api/files/search` | The above, but ~an order of magnitude more CPU each — it reads the whole bucket tree out of KV and walks every key | Its own tighter budget, a 64-character query cap, and an edge cache |
| `/api/multiplayer` upgrades | $0.15/M Durable Object requests over 1M | `SOCKET_BUDGET`, 30 upgrades per client per minute |
| Cursor messages | Incoming WebSocket messages count as DO requests at 20:1 | `MAX_PEERS` (20 a room, 7 rooms) × `MAX_MESSAGES_PER_SECOND` (30) |
| Cursor connections | $12.50/M GB-s over 400k | Hibernation. `acceptWebSocket()`, not `accept()` — this is the difference between "billed while anyone is connected" and "billed while anyone is moving" |
| D1 | $1.00/M rows written, $0.001/M rows read | Sessions are the only unauthenticated write path; `AUTH_BUDGET` caps it at 10/min |
| R2 | $0.36/M class B ops. Egress is free | `API_BUDGET`. Files are normally served straight off `upload.rcn.sh`, so `/api/files/download` is a fallback nobody's browser uses |

Worst case with everything in this repository working and no dashboard rules at
all: the multiplayer Worker is bounded at roughly $100/month, because both its
concurrency and its message rate have ceilings. The site Worker is not bounded
at all — per-client budgets are per Cloudflare location, so a caller spread
across colos multiplies its allowance by however many it reaches. That gap is
what the WAF rule below is for.

## What the repository does

- **`limits.cpu_ms`** in both `wrangler.jsonc` files. The default is 30 seconds
  of CPU per invocation. 500ms on the site and 50ms on the multiplayer Worker
  is two orders of magnitude above what either needs, and cuts the worst case
  per request by 60x. This is the single highest-leverage line here: CPU past
  the included allowance costs 30x more per request than the request does.
- **`ratelimits` bindings**, spent in `src/lib/throttle.ts` from the middleware,
  before `next()` and so before any route touches D1, KV or R2. Counted in the
  same isolate the Worker already runs in: no subrequest, no latency, no charge.
- **An upgrade budget on the cursor Worker** (`churning()` in
  `workers/multiplayer/src/index.ts`). `MAX_PEERS` bounds how many sockets can
  be open and `Budget` bounds how fast one may talk, but neither bounds
  connect-disconnect-repeat, which bills a Durable Object request each time
  without ever filling a room.
- **An edge cache on `/api/files/search`**, keyed on the normalised query, plus
  a length cap so the cache key cannot be made unbounded.

Everything in `throttle.ts` and `churning()` fails open — a missing binding, a
missing client address, a limiter that throws. A cost control that takes the
site down when it misfires is a worse outage than the bill it prevents.

## What the dashboard has to do

Two things code cannot do.

### 1. A rate limiting rule, so a flood never reaches the Worker

The Worker budgets are counted after the Worker starts, which means the request
is already billed. Cloudflare's security phases run before Workers do — DDoS
protection, then custom rules, then rate limiting rules — and a request blocked
in one of them never invokes the Worker at all.

On a **Free zone plan** you get one rate limiting rule, matching on Path only,
counting by IP, with a 10-second window and a 10-second block. That is enough
for the shape of this site:

> **Security → WAF → Rate limiting rules → Create rule**
> - If: `URI Path` starts with `/api/`
> - Rate: 20 requests per 10 seconds, per IP
> - Action: Block, 10 seconds

Twenty requests in ten seconds is roughly ten times what one reader's browser
does. Raise it if `/files` search or the guestbook ever trips a real visitor.

On **Pro** the rule can match Host, URI and Query, the window goes to a minute
and the block to an hour, and there are two rules — enough to give
`/api/files/search` its own tighter one.

### 2. Notifications, because nothing here is a spend cap

None of the above stops a bill; it only slows one down. The only thing that
tells you it is happening is a notification.

> **Notifications → Add** — add the Billing usage notifications for the
> account, and set a Workers usage alert well below what you would be willing
> to pay.

Check they arrive. An alert nobody receives is not a control.

## If it is happening now

In rough order of how much it costs to be wrong:

1. **Look before acting.** Workers & Pages → the Worker → Metrics, and Security
   → Events. Both Workers have `observability` on, so Workers Logs has the
   429s. A spike shaped like one path from a handful of ASNs is an attack; a
   spike across every path is a link somewhere.
2. **Tighten the rate limiting rule.** Lower the threshold, or point it at the
   one path being hit. Reversible in a click, and it is the change that
   actually stops the meter.
3. **Add a custom rule** if the traffic has a signature — an ASN, a country, a
   user agent. Custom rules run before rate limiting and take a Block action.
   Do not block a whole country to stop one host.
4. **Turn the feature off** rather than the site. Cursors are the surface with
   duration billing: deleting the `rcn.sh/api/multiplayer*` route leaves the
   site working and the cursors quietly absent.
5. **Last resort**: `wrangler delete`, or disable the route, and serve nothing.
   Costs nothing and does nothing. Prefer any step above it.

## When adding a route

A new route under `src/pages/api/` inherits `API_BUDGET` automatically — the
middleware catches everything the Worker renders. It needs its own budget in
`bucketFor()` only if it is unusually expensive per call, the way search is, or
unusually dangerous per call, the way the OAuth callback's D1 writes are.

Namespace ids are account-wide, not per-Worker. The site uses the 1000 range
and the multiplayer Worker the 2000 range; two bindings sharing an id share
their counters.
