# 0177. Prose styles post bodies and never reaches into Expressive Code

`prose` in `src/styles/global.css` styles post bodies only, at a narrow measure, and never touches `figure`, `figcaption` or `pre`: fenced code belongs to Expressive Code, which renders those elements. Inline code styles target `:where(p, li, td, th, h2, h3, h4, blockquote) > code`; listing parents rather than excluding `pre` means they can never reach inside an Expressive Code block.

Every prose block gets a top margin, never a bottom one, so stacked elements cannot double their gap. Blockquotes are marked by a left rule rather than a fainter colour, because `ink-faint` is a metadata tone and drops under 4.5:1 at reading size. Tables are `display: block` with overflow scrolling: Markdown emits a bare `<table>`, so the table must be the scroll container or a wide one drags the whole page sideways.
