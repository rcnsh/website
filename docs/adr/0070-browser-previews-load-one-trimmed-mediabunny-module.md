# 0070. Browser previews load one trimmed Mediabunny module

`src/lib/media-preview.ts` is the only module that imports Mediabunny for the browser, and the preview panel loads it with `import()`. Only what this module imports is bundled, so Mediabunny stays out of the page's main bundle.

It registers MP4, QTFF, WebM, Matroska, MP3, WAVE, Ogg, FLAC and ADTS (`FORMATS`), not HLS or MPEG-TS. Those demuxers are most of Mediabunny's weight, and nobody drops those formats into a file bucket to preview.

In-memory previews are `data:` URLs, never `blob:` URLs. `img-src` already admits `data:`, so no `blob:` grant is needed in either CSP.
