# 0075. Waveform peaks are accumulated per chunk by integer frame position

Waveforms are drawn from `PEAK_COUNT` (1000) peaks in `src/lib/preview-math.ts`, more than a preview panel is wide, so the line stays crisp on 2x displays.

`accumulatePeaks` folds decoded audio chunk by chunk into running per-bin absolute maxima, with each sample mapped to a bin by its position in the whole signal. The whole decoded signal is never held in memory at once, and mapping by position makes chunks order-independent. Bin assignment uses integer frame positions (`offset + frame`) rather than floating-point time: in floating point, a sample on a bin edge would land on either side depending on where the decoder happened to split its chunks.

Stored peaks are 0..255 integers in a JSON sidecar (`quantizePeaks`, `dequantizePeaks`), a quarter the size of the decimal representation.

## Consequences

`src/lib/preview-math.test.ts` feeds 1152-frame chunks: 1152 is an MP3 frame's sample count and does not divide a bin evenly, so the test exercises chunks that straddle bin edges.
