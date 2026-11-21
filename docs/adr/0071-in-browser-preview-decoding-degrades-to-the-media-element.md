# 0071. In-browser preview decoding degrades to the media element

Without stored thumbs, `src/components/react/MediaPreview.tsx` decodes previews in the browser with Mediabunny. A decode failure keeps the player available, since the browser's media element may play a file Mediabunny could not preview.

Decoded resources are handled explicitly. Generated `ImageBitmap`s are closed, because they hold decoded pixel memory until `close()`. Peaks from the waveform generator are copied before they are set as state, because the generator keeps mutating its own array as it decodes. Waveform bars are normalised to the loudest peak with a floor on the scale (`1 / Math.max(loudest, 0.05)`), so quiet recordings still show their shape and near-silent ones are not amplified into noise.
