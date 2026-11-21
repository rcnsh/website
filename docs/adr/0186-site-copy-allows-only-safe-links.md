# 0186. Site copy in site.json allows only safe links

Prose in site.json is rendered by `src/components/RichText.astro`. Config copy must not be able to inject markup or `javascript:` URLs.

RichText parses only `[text](url)` links out of the copy and emits everything else as plain text. `safeHref` accepts site-relative hrefs (starting `/` or `#`) and absolute `http:`, `https:` and `mailto:` URLs; any other href keeps its label as plain text and drops the link. External `http(s)` links open in a new tab with `rel="noopener noreferrer"`.
