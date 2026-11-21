# 0174. The post TOC maps h2 to h4 and tracks the heading under the header

`src/components/writing/PostToc.astro` lists only headings of depth 2 to 4: the h1 is the post title, and below h4 the list stops being a map.

The current heading is computed against the `--header-h` offset that the headings' scroll margin clears, so a heading jumped to from the TOC is the one marked current.
