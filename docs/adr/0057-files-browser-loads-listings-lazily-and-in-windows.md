# 0057. The files browser loads listings lazily and renders them in windows

Rendering every row of a big folder at once is slow, so `FileBrowser` renders the first `WINDOW` (200) rows, keeps rows 60 past the selection rendered as it walks down, and offers a "show more" button for the next `WINDOW`.

A selected folder's listing is fetched only after `PEEK_DELAY_MS` (250ms) of staying selected, because its preview may need a fetch and walking past folders with j/k would otherwise fire one per folder. The load effect is keyed on the folder and the viewer, and the peek effect on `files.owner` too: the owner upgrade replaces the visitors' listings and drops lazily loaded ones, so they must load again. A failed listing waits for the retry button rather than reloading, which would loop.
