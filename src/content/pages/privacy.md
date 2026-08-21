---
heading: Privacy
standfirst: This is a personal site with no analytics, no advertising and no tracking. The short version is that reading it leaves nothing behind.
---

## What is collected when you read

Nothing. There is no analytics script, no tag manager, no advertising network, no
fingerprinting, and no cookie banner — because there are no cookies to consent to unless you
sign in to the guestbook.

Serving a page necessarily involves Cloudflare, which sits in front of the site as CDN and
runtime. Cloudflare processes the request as it routes it — IP address, user agent, the URL
you asked for — and keeps operational logs of that under
[its own privacy policy](https://www.cloudflare.com/privacypolicy/). I don't add anything to
those logs, and I don't use them to build a picture of anyone.

## Cookies

Two, both only if you sign in to the guestbook, and both strictly functional:

- `rcnsh_session` — an opaque session identifier. It lasts 30 days, is renewed if you come
  back, and is deleted when you sign out.
- `rcnsh_oauth_state` — a short-lived value that exists only to stop a forged sign-in
  round-trip. It is discarded as soon as you come back from GitHub.

Neither is used for analytics, and neither is shared.

## What the guestbook stores

Signing in with GitHub uses the default OAuth grant, which reads your **public** profile and
nothing more. No repository access, no email scope, no private data. What is written to the
database is:

- your GitHub numeric id, username, display name and avatar URL
- the message you wrote
- when you wrote it, and when you last edited it

Your entry is public, which is the point of a guestbook. One entry is kept per person, so
signing again replaces what you wrote rather than adding to it. **To delete your entry, mail
me** at [jacobjameswiltshire@protonmail.com](mailto:jacobjameswiltshire@protonmail.com) from
any address and say which GitHub username it belongs to — I'll remove it and the session rows
with it. No form, no waiting period.

## Third parties

Four services see something as a page is built or served, and none of them see you:

- **Cloudflare** — CDN, Workers runtime, and the D1, R2 and KV stores behind the site.
- **GitHub** — the OAuth sign-in you initiate, plus my own public profile and repository data
  fetched server-side.
- **Spotify** — my listening data, fetched server-side with my own credentials.
- **Cloudflare R2** — files on the [files](/files) page are served from `upload.rcn.sh`.

The Spotify and GitHub calls are made by the server with my credentials, not yours. Your
browser never talks to either unless you click a link.

## Fonts, embeds and outbound links

Fonts are self-hosted; nothing is loaded from a font CDN. There are no embedded videos,
iframes, comment widgets, or share buttons that phone home. Outbound links to my own things
go through `go.rcn.sh`, a short-link redirector I run — links to anyone else's site go
directly. Once you leave, that site's own policy applies.

## Data requests

Mail the address above. You can ask what is stored about you, ask for it in a machine-readable
form, or ask for it deleted, and the answer will be a short one because there is very little
to hand over. I don't sell anything to anyone, because there is nothing to sell.

## Changes

If this page changes materially, the change lands in
[the site's public git history](https://github.com/rcnsh/rcnsh-new/commits/main/src/content/pages/privacy.md),
where it can be read as a diff rather than taken on trust.
