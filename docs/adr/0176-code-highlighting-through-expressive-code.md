# 0176. Code highlighting goes through Expressive Code, themed from global.css

Code blocks are highlighted by Expressive Code. It is the first entry in `integrations` in `astro.config.ts`, because it installs the syntax highlighter the Markdown pipeline uses, so integrations that consume Markdown must come after it.

It uses one theme, `vitesse-dark`, with `useDarkModeMediaQuery: false`: the site is dark-only, so there is no second theme to switch to. Every `styleOverrides` value is an explicit `var()` reference to a `global.css` token, which keeps `global.css` the one place colours live. Expressive Code cannot derive a colour from a `var()`, so each setting it would otherwise derive from another colour gets its own value. Frames have no shadow (`shadowColor: "transparent"`, `frameBoxShadowCssValue: "none"`) because the site separates elements with rules, not shadows.

`markdown.syntaxHighlight` is set to `false` explicitly even though Expressive Code also sets it. Expressive Code sets it only after Astro's CSP check has run, so without the explicit `false` Astro warns that the default Shiki highlighter conflicts with CSP.
