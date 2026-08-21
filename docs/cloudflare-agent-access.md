# Letting agents reach rcn.sh

Two of the things an agent-readiness audit checks cannot be fixed from this
repository, because nothing in the repository causes them. Both are Cloudflare
zone settings, and both need someone with dashboard access to change them.

This page records what was measured, what is causing it, and exactly which
toggles to flip.

## What was measured

From outside the network, against `https://rcn.sh/`:

```
$ for ua in "Mozilla/5.0" ChatGPT-User ClaudeBot GPTBot PerplexityBot Google-Extended; do
    printf '%-16s ' "$ua"; curl -s -o /dev/null -w '%{http_code}\n' -A "$ua" https://rcn.sh/
  done
Mozilla/5.0      200
ChatGPT-User     403
ClaudeBot        403
GPTBot           403
PerplexityBot    403
Google-Extended  200
```

The 403 body is Cloudflare's `Attention Required!` interstitial, served with
`server: cloudflare` and a `cf-ray` header, and it never reaches the Worker.
The origin is not involved.

`https://rcn.sh/robots.txt` also came back carrying a block this repository does
not contain:

```
# BEGIN Cloudflare Managed content

User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /

User-agent: ClaudeBot
Disallow: /
...
User-agent: GPTBot
Disallow: /

# END Cloudflare Managed Content
```

Cloudflare injects that ahead of whatever the origin returns. So the site was
telling AI crawlers to stay away *and* blocking the ones that came anyway.

`Google-Extended` returning 200 is consistent with the rest: it is a
robots.txt-only token that Google honours in its own crawler, not a user agent
that ever shows up in a request, so there was nothing at the edge for a WAF rule
to match on.

## Fix 1 — stop blocking AI crawlers

Cloudflare dashboard → your account → **rcn.sh** → **AI Crawl Control** →
**Settings**.

Each known AI crawler has an action in the **Actions** column. Set the ones you
want reading the site to **Allow**. At minimum, for the audit to pass:
`ChatGPT-User`, `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `Claude-User`,
`PerplexityBot`, `Google-Extended`.

If the zone predates AI Crawl Control, the same block lives under
**Security** → **Bots** as a single toggle labelled **AI Scrapers and
Crawlers**. Turn it off, then use AI Crawl Control for per-crawler control.

While you are in **Security** → **Bots**, check two more things:

- **Bot Fight Mode**, if on, challenges non-browser traffic indiscriminately.
  An agent cannot solve a challenge, so it reads as a block. Turn it off, or
  move to Super Bot Fight Mode where "Definitely automated" can be set to
  *Allow* for verified bots.
- Any **WAF custom rule** matching on `cf.client.bot` or on user-agent strings.
  A rule written to stop scrapers will catch these too.

## Fix 2 — stop the managed robots.txt overriding ours

Cloudflare dashboard → **rcn.sh** → **Security** → **Settings**, filter by
**Bot traffic**, and turn **off** "Set your preference to block training in
robots.txt".

This repository serves its own `robots.txt` from `src/pages/robots.txt.ts`,
which names every AI crawler and allows each one the whole site. With the
managed setting on, Cloudflare's `Disallow` lines are prepended and win.

Turning it off is a real decision, not just an audit fix: it withdraws the
`ai-train=no` content signal, which is the site's stated reservation of rights
over AI training under Article 4 of the EU copyright directive. If you want
crawlers to read the site but still not train on it, leave the managed setting
off and add the signal to our own file instead — a `Content-Signal:` line in
`src/pages/robots.txt.ts` alongside the `Allow: /` rules — so the two are not
in contradiction.

## Verifying

After both changes, from a machine outside Cloudflare:

```bash
# 1. Every named crawler reaches the homepage.
for ua in ChatGPT-User ClaudeBot GPTBot PerplexityBot Google-Extended DeepSeekBot; do
  printf '%-16s %s\n' "$ua" "$(curl -s -o /dev/null -w '%{http_code}' -A "$ua" https://rcn.sh/)"
done   # all 200

# 2. robots.txt is ours, with no Disallow but /api/.
curl -s https://rcn.sh/robots.txt | grep -c '^Disallow:'   # 1

# 3. The rest of the work in this branch is live.
curl -sI -H 'Accept: text/markdown' https://rcn.sh/about | grep -iE 'content-type|vary'
curl -s -o /dev/null -w '%{http_code}\n' https://rcn.sh/a-path-that-does-not-exist   # 404
curl -s https://rcn.sh/.well-known/mcp.json | head -c 200
curl -s https://rcn.sh/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}' | head -c 200
```

## A note on what robots.txt can and cannot do

`src/pages/robots.txt.ts` names every AI crawler explicitly and allows each one,
which is worth doing — a named `Allow` is what a bot-management layer reads as
intent, and it is the durable record that this site meant to be readable.

But robots.txt is advice to a crawler that chooses to read it. It cannot lift a
WAF block: a request refused at the edge never gets far enough to have read
anything. The two fixes above are the only ones that change what an agent
actually receives.
