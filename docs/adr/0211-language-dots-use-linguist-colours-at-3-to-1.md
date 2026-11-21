# 0211. Language dots use Linguist colours held to 3:1 contrast

The repos list marks each repo's language with a coloured dot. `COLOURS` in `src/lib/languages.ts` uses GitHub Linguist's colours except where one fails the 3:1 non-text contrast minimum against `--color-surface`, which are lifted along their hue: TypeScript's blue becomes `#6f9bd8`. Python is `#d8c56f`, a yellow rather than a lifted blue. Languages not in the table get `NEUTRAL_DOT`, because a guessed colour would mislead.
