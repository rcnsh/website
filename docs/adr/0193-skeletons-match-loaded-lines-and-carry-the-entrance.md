# 0193. Skeletons match the loaded lines and carry the entrance animation

Skeleton words and lines use `placeholder-text` inside an element with the loaded text's type classes, because a fixed-height box never quite matches a line's height. A skeleton for a wrapping line is transparent sample text of the real line's shape on the pulse, so it wraps where the real text will at every width.

The fallback makes the entrance. A server island replacing a same-shape fallback sets `data-risen`, which turns off `animate-rise` inside it (`[data-risen] .animate-rise` in `src/styles/global.css`); running the rise again on the swap blinks the title and tiles a moment into the load.

The rise keyframes start at opacity 0.01, not 0. Chrome does not count a fully transparent element as painted, which deferred LCP until the animation's first frame.
