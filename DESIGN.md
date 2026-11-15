# rcn.sh — design

Why the site looks the way it does. `CLAUDE.md` covers how it works. Keep both
current.

## Brief

- **Subject:** Jacob Wiltshire, computer science student at Newcastle, on
  exchange at NUS. The site is his live record: what he is playing, his
  contribution year, his files, his guestbook.
- **Audience:** developers and recruiters who followed a link, friends signing
  the guestbook.
- **Job:** show who he is and what he is doing right now, from live data.
- **Limits set for the redesign:** the same colour palette and the same
  features. Nothing was removed; every tile, page and control is still there.

## Concepts considered

| | Idea | Anchor | Signature | O / F / Fe / P |
|---|---|---|---|---|
| A. Identity | **The lattice.** The rcn mark is drawn on a triangle grid, so the site draws everything on that grid, in the contribution graph's five blues | The mark is exactly 9 sides by 3 rows of equilateral triangles; the palette already has five levels | The hero is the album playing right now, redrawn in triangles | 5 / 5 / 4 / 1 |
| B. Place | Plus eight: the site runs on Singapore time with Newcastle as a ghost | He lives eight hours ahead of home | A 24-hour rule with two needles | 4 / 5 / 4 / 2 |
| C. Name | `.sh`: every page is a shell transcript | The domain, the palette shell | Pages type themselves out | 2 / 4 / 5 / 4 |

**Pick A.** B was the earlier attempt (`redesign/reimagining`): honest, but a
clock is a small idea to hang a site on. C already exists as the palette shell.
A needs both of his own things at once, the mark's geometry and his listening
data, so it cannot be moved to anyone else.

## Concept card

```
Idea:        Everything he is doing is drawn on the grid his mark is made of.
Metaphor:    a contribution graph that grew up: one lattice, five levels
Signature:   the home field. The cover of the track playing now, redrawn as
             lattice triangles in the five contribution blues, dissolving
             towards the name. Nothing playing: the mark itself.
Emotion:     "wait, is that the album?" then recognising the mark in the grid
Motion verb: sweep on the slant. Things arrive along the mark's 60° edge.
Screenshot:  the name at full size against the cover in triangles
```

## Driver

One module, `src/lib/lattice/field.ts`, one canvas fixed behind every page. A
page marks one element `data-lattice` and says what to draw there:

| Value | Picture | Used by |
|---|---|---|
| `cover` | the playing track's cover, else the mark | home, `/music` |
| `svg:<selector>` | an inline SVG on the page, by its shapes' `data-level` | `/guestbook`: the world map, signed countries lit |
| `mark` | the rcn mark, exact on the grid | every other title band, post headers |
| `text:404` | the status code | the 404 |

Moving between pages sweeps one picture into the next along the slant; the
canvas is persisted, so it is one continuous surface for the whole visit.

- **Idle:** each triangle breathes a little out of step, and a band of light
  crosses on the slant every twelve seconds.
- **Pointer:** the lattice uncovers itself around the cursor, anywhere on the
  page: in the picture it lifts what is there, and beyond it the empty grid
  shows through the margins and the gaps between tiles while the pointer moves.
- **Scroll:** the field thins out as its block leaves the screen.
- **Reduced motion, or Live updates off:** one still frame, no loop.
- **No WebGL:** nothing is drawn and every page is complete without it. The
  404 carries its code as a label for this reason.

## Palette

The tokens in `global.css`, unchanged but for `ink-faint`, lifted along its
own hue from `#807a73` to `#8c867e`: the old value was 4.38:1 on a tile, under
the 4.5:1 its role needs. It now clears 4.5:1 on every ground. The field uses the contribution graph's own five
levels (`raised`, two mixes, `brand-deep`, `brand`), read from the same custom
properties, so the two can never drift.

## Type

Geist Mono 700 as the display voice, Geist for text, as before. The home name
is the one new size: `clamp(3.25rem, 9.2vw, 9.5rem)`, tracking -0.065em,
leading 0.86, sized so the surname ends before the cover turns solid.

## Layout

- Home opens on the field, full-bleed and one screen tall: name, tagline, bio,
  the now-playing card, and a caption naming what the triangles are drawing.
  On a phone the cover runs edge to edge above the name instead of beside it.
- The tile grid follows, unchanged in content, reordered so writing and the
  contribution year come first.
- Every inner page opens on a title band (`page-band`): full-bleed, a third
  of a screen tall, the title at display size on the left and the field's
  picture on the right. The tiles below were reflowed to full rows where the
  old title tile used to share one. Post headers stay inside the frame and
  carry a small mark in their corner, since they are for reading.
- A tile (`tile`) is an open panel, not a card: no fill and no box, a hairline
  along its top with a short slanted brand tab at its left end. The page
  ground, and the lattice under the pointer, run straight through it. Only
  what is clickable as a whole keeps a bordered surface (`tile-link`: link
  tiles and repo cards), so a box now means "this goes
  somewhere".
- The lattice is drawn finer in a band (13px sides) than on the home field
  (24px), so a picture a third of the height still has its detail.

## Motion

- One ease, `--ease-out-quint`. 0.9s for the name, 0.5s for the page wipe,
  0.35 to 0.45s for hovers.
- **Page transition:** the incoming page is uncovered left to right behind an
  edge cut at 60°, plain CSS on the router's view transition.
- **Hover, one treatment per role:** link tiles get a slanted bar running in
  along the top edge; link rows get a slanted marker and step aside for it
  (`row-tick` for text rows, `row-mark` for track rows with a cover);
  nav keeps its travelling underline.

## Decisions worth knowing

- The frame loop is the site's only `requestAnimationFrame`, and it stops off
  screen, in a hidden tab, and whenever the field is still.
- No GSAP, Lenis or OGL: the field is one fragment shader and about 300 lines
  of plain WebGL, so the page budget barely moved.
- Covers are stretched to their own luminance range before being drawn, or a
  dark sleeve comes out as one flat tone.
- Each cover triangle shows the mean of the picture under it, not the pixel at
  its centre, so detail finer than a triangle evens out instead of speckling.
