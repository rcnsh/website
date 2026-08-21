---
heading: About
standfirst: I'm Jacob Wiltshire. I read computer science, I write mostly TypeScript and Python, and rcn.sh is where the things I build end up.
---

## Who I am

I'm a computer science student at [Newcastle University](https://www.ncl.ac.uk/), currently
studying abroad at the [National University of Singapore](https://www.nus.edu.sg/). `rcn` is
the handle I've used for long enough that it's easier to keep than to explain — it's the
name on my [GitHub account](https://github.com/rcnsh), on this domain, and on the short-link
domain `go.rcn.sh` that the outbound links here go through.

Most of what I write day to day is TypeScript, with Python close behind for anything that
starts as a script and refuses to stay one. The rest of my time goes on whatever I've
decided is interesting that month: web infrastructure, small tools, the occasional thing
that only exists because it was funny at the time.

## What this site is

A personal site, not a product. It has no accounts, nothing to buy, and no newsletter. What
it does have:

- **[Writing](/blog)** — posts on software and side projects, with [RSS](/rss.xml) and
  [JSON](/feed.json) feeds.
- **[Music](/music)** — what I'm listening to right now, my top tracks and artists, and
  recent plays, read live from the Spotify API.
- **[Files](/files)** — a browser over a public Cloudflare R2 bucket. Everything in it is
  public on purpose.
- **[Guestbook](/guestbook)** — sign in with GitHub and leave a message. It is the only part
  of the site that writes anything down.

## How it's built

The site is [Astro](https://astro.build/) 7 with [React](https://react.dev/) 19 islands,
[Tailwind](https://tailwindcss.com/) 4 for styling, and it runs as a
[Cloudflare Worker](https://developers.cloudflare.com/workers/). Pages are prerendered where
they can be; anything that needs live data arrives through a server island or a route that
opts out of prerendering, so a slow Spotify response delays a card rather than the page.

Behind it: **D1** holds the guestbook and its sessions, **R2** holds the files, and **KV**
caches Spotify tokens and GitHub responses so neither API gets hammered. Sign-in is a
hand-rolled GitHub OAuth flow rather than a library — it's about a hundred lines, and they're
a hundred lines I can read.

The source is public at [rcnsh/rcnsh-new](https://github.com/rcnsh/rcnsh-new). It replaced an
older Astro build that stopped compiling against current packages, which is a normal way for
a personal site to die.

## For agents and crawlers

Every page here is available as clean Markdown: ask for it with `Accept: text/markdown` and
you'll get the prose without the navigation, scripts and layout wrappers. There's a site map
for machines at [/llms.txt](/llms.txt), the whole site inline at
[/llms-full.txt](/llms-full.txt), and an [MCP server](/docs) at `https://rcn.sh/mcp` if you'd
rather call tools than fetch pages. All of it is public and read-only, and none of it needs a
key. The full list is on the [developer and agent docs](/docs) page.
