# 0073. Previews give up on unrecoverable input

The preview `UrlSource` (`src/lib/media-preview.ts`) retries at most twice, after 0.5s and 1s, then gives up. A CORS refusal or a 404 will not fix itself; Mediabunny already stops early on suspected CORS errors, and this bounds everything else.

A cover image that fails to decode yields null instead of an error. Tags can claim any image type, and a bad one should not fail the preview.
