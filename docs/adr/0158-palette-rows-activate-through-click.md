# 0158. Palette rows activate through their own click

Enter on the palette input calls `click()` on the active row, so keyboard and pointer activation go through the same path: the router, `target=_blank` and close handling. A click on a row closes the palette in a `setTimeout`, because setting `inert` on the palette during the click's dispatch would cancel the link activation the click rides on.
