---
heading: rcn.sh developer & agent docs
standfirst: Every machine-readable thing on rcn.sh, with the exact request to make. Public, read-only, and no API key anywhere.
---

Everything below is served from `https://rcn.sh`, over HTTPS, with no authentication and no
registration. There is no formal rate limit; be reasonable and you'll never notice one.

## rcn.sh MCP server

The [Model Context Protocol](https://modelcontextprotocol.io) server exposes this site as
tools an AI agent can call directly, over **Streamable HTTP**.

```
https://rcn.sh/mcp
```

Add it to a client that reads the standard config shape:

```json
{
  "mcpServers": {
    "rcn.sh": { "type": "http", "url": "https://rcn.sh/mcp" }
  }
}
```

Or drive it by hand — every request is one POST:

```bash
curl -s https://rcn.sh/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The machine-readable descriptor — endpoint, transport, protocol versions, every tool and
every resource — is at [/.well-known/mcp.json](/.well-known/mcp.json).

### Tools

| Tool | What it does |
| --- | --- |
| `list_pages` | Every page and post, with path, title and description. |
| `get_page` | One page or post as clean Markdown. |
| `search_site` | Substring search across titles, descriptions and bodies. |
| `list_posts` | Published posts, newest first. |
| `list_repos` | The public GitHub repositories highlighted on the site. |
| `now_playing` | The track playing on Spotify right now, or the last one. |
| `top_music` | Top tracks or artists over a window, or recent plays. |
| `search_files` | Search the public R2 bucket by filename. |

Every tool is read-only and annotated as such. Nothing on this server changes state.

### Resources

`resources/list` returns each page, each post, and the three generated documents
(`llms.txt`, `llms-full.txt`, the agent instructions) as `text/markdown`. Every resource URI
is the page's real URL, so anything the list returns can also be opened in a browser.

### Protocol versions

`2026-07-28`, `2025-11-25`, `2025-06-18` and `2025-03-26` are all accepted. Modern clients can
call `server/discover`; older ones get the `initialize` handshake. A version we don't
recognise is answered with the newest one we support rather than refused.

## Markdown instead of HTML

Every page listed under *Pages* below serves Markdown as well as HTML from the same URL,
following the [acceptmarkdown.com](https://acceptmarkdown.com) convention. Ask for it:

```bash
curl -s -H 'Accept: text/markdown' https://rcn.sh/about
```

You get `Content-Type: text/markdown; charset=utf-8` and `Vary: Accept`. A request whose
`Accept` header rules out both HTML and Markdown gets a `406` listing what is available,
rather than the wrong format with a misleading content type. Blog posts return their original
Markdown source, not a conversion.

## Files for agents

| Path | What it is |
| --- | --- |
| [/llms.txt](/llms.txt) | The site map: what this is, when to use it, and every resource, annotated. |
| [/llms-full.txt](/llms-full.txt) | Every page and post concatenated into one Markdown document. |
| [/.well-known/agent-instructions.md](/.well-known/agent-instructions.md) | When to reach for this site, when not to, and how to call it. |
| [/.well-known/mcp.json](/.well-known/mcp.json) | MCP server descriptor. |
| [/sitemap-index.xml](/sitemap-index.xml) | Every indexable URL. |
| [/robots.txt](/robots.txt) | Crawl policy. Every named AI crawler is allowed the whole site. |

## HTTP endpoints

All of these are `GET`, return JSON, and answer with an empty result rather than an error
status when an upstream is unavailable — so a caller never has to distinguish "nothing
playing" from "Spotify is down" by parsing a stack trace.

### `GET /api/spotify/now-playing`

The track playing right now. Falls back to the most recently played one, with
`playing: false`, when nothing is.

### `GET /api/spotify/top`

Top tracks and artists. Takes `range=short_term|medium_term|long_term` (roughly four weeks,
six months, all time). Defaults to `long_term`.

```bash
curl -s 'https://rcn.sh/api/spotify/top?range=short_term'
```

### `GET /api/files/list`

Objects and folders in the public R2 bucket. Takes `prefix=`, defaulting to the root.

### `GET /api/files/search`

Search the bucket by filename. Takes `q=`, minimum two characters.

## Feeds

[RSS 2.0](/rss.xml) and [JSON Feed 1.1](/feed.json), both covering everything under
[Writing](/blog).

## Source

The whole site, including every endpoint above, is at
[github.com/rcnsh/rcnsh-new](https://github.com/rcnsh/rcnsh-new). If something here is wrong,
the code is the thing to check it against.
