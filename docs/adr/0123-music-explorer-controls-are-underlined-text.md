# 0123. Music explorer controls are underlined text switches

The range and kind switches in `MusicExplorer` (`src/components/react/MusicExplorer.tsx`) are underlined text, not a filled segmented pill. Each switch's hit area is grown with an `after:` pseudo-element (`inset-y` of -0.625rem) rather than padding, because `pb-0.5` sets the gap between the text and its underline and extra padding would move the border.

The control row spaces groups wider (`gap-x-6`) than buttons within a group (`gap-4`), so the five buttons do not read as one undifferentiated run. The separator between groups shows only from `sm` up: below that the row wraps, and a separator stranded at the end of the first line reads as a stray character.
