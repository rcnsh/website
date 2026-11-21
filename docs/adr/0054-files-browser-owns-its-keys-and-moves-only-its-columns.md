# 0054. The files browser owns its keys and scrolls only its columns

The browser is driven from the keyboard (j/k, arrows, `/`). It stops propagation of every key it handles, including `/`: the command palette listens for `/` on window, while inside the browser `/` focuses the browser's own search. The waveform slider in `MediaPreview.tsx` stops propagation of its arrow keys in turn, or `FileBrowser` would read them as moving the selection.

Selection is kept in view by setting the column's `scrollTop` directly, since `scrollIntoView` also scrolls the page. The selected row's highlight has no transition, because j/k moves the selection quickly and a fading highlight trails behind and looks laggy. On touch a second tap on the selected row opens it, since touch screens have no reliable double-click; a mouse uses double-click.
