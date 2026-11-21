# 0060. The files navigator is styled in plain CSS with hand-written icons

The /files navigator is styled in `src/components/files/browser.css` rather than Tailwind utilities, because most of it is state selectors (`aria-selected`, `aria-pressed`) and breakpoint-specific column templates, which utilities express poorly. Toolbar segment buttons have a larger hit area than their visible underline, so they are easier to hit, especially on touch.

Its icons (`src/components/files/icons.tsx`) are hand-written JSX on a 24x24 stroked grid matching the approved mockup, which keeps an icon library out of the island bundle.
