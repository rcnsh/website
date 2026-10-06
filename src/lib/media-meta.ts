import { ALL_FORMATS, CustomSource, Input } from "mediabunny";

// Demux-only metadata for /api/files/meta. Workers have no WebCodecs, so
// nothing here may decode: no sinks, no Conversion. Kept free of
// `cloudflare:workers` so `node --test` can drive it with a fake bucket.

/** The slice of R2Bucket this module touches, so a test can stand in for it. */
export type RangeBucket = {
  get(
    key: string,
    options: { range: { offset: number; length: number } },
  ): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

/**
 * Ceilings on what one metadata read may pull from R2. A moov-at-the-end MP4
 * needs four reads; anything near these limits is a file whose duration would
 * mean scanning it end to end, and the Worker's CPU limit would end it first.
 */
export const READ_BUDGET = { reads: 48, bytes: 24 * 1024 * 1024 };

export class ReadBudgetExceeded extends Error {
  constructor(what: string) {
    super(`Metadata read budget exceeded: ${what}`);
    this.name = "ReadBudgetExceeded";
  }
}

export type ReadStats = { reads: number; bytes: number };

/**
 * A Mediabunny source over one R2 object, one ranged GET per read. Mediabunny
 * coalesces and caches what it asks for, so this stays a plain mapping.
 */
export function bucketSource(
  bucket: RangeBucket,
  key: string,
  size: number,
  stats: ReadStats = { reads: 0, bytes: 0 },
  budget = READ_BUDGET,
): CustomSource {
  return new CustomSource({
    getSize: () => size,
    // `end` is exclusive: Mediabunny guarantees 0 <= start < end <= size.
    read: async (start, end) => {
      const length = end - start;
      stats.reads += 1;
      stats.bytes += length;
      if (stats.reads > budget.reads) throw new ReadBudgetExceeded("reads");
      if (stats.bytes > budget.bytes) throw new ReadBudgetExceeded("bytes");

      const object = await bucket.get(key, { range: { offset: start, length } });
      // Gone between the head and this read. Throwing keeps it out of the cache.
      if (!object) throw new Error(`R2 object ${key} disappeared mid-read`);

      const bytes = new Uint8Array(await object.arrayBuffer());
      if (bytes.byteLength !== length) {
        throw new Error(
          `R2 returned ${bytes.byteLength} bytes for a ${length}-byte range of ${key}`,
        );
      }
      return bytes;
    },
  });
}

export type MediaMeta =
  | { supported: false }
  | {
      supported: true;
      container: string;
      mimeType: string;
      /** Seconds, or null when only a full scan could tell. */
      duration: number | null;
      video: {
        codec: string | null;
        /** Display dimensions: after rotation and pixel aspect ratio. */
        width: number;
        height: number;
        rotation: number;
        /** Frames per second, estimated from the first packets. */
        frameRate: number | null;
      } | null;
      audio: {
        codec: string | null;
        channels: number;
        sampleRate: number;
      } | null;
      tags: {
        title?: string;
        artist?: string;
        album?: string;
        year?: number;
        coverArt: boolean;
      };
    };

/** Packets sampled for the frame rate. Enough to settle, few enough to stay cheap. */
const FRAME_RATE_PACKETS = 90;

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/**
 * Reads container, tracks and tags. Throws on any read failure, which is what
 * keeps a transient R2 error from being cached as `{ supported: false }`.
 */
export async function readMediaMeta(source: CustomSource): Promise<MediaMeta> {
  const input = new Input({ source, formats: ALL_FORMATS });

  try {
    if (!(await input.canRead())) return { supported: false };

    const format = await input.getFormat();
    const [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    // A container with no playable track (an MP4 holding only subtitles, say).
    if (!videoTrack && !audioTrack) return { supported: false };

    const video = videoTrack
      ? {
          codec: await videoTrack.getCodec(),
          width: await videoTrack.getDisplayWidth(),
          height: await videoTrack.getDisplayHeight(),
          rotation: await videoTrack.getRotation(),
          frameRate: await videoTrack
            .computeFrameRateMetrics({ targetPacketCount: FRAME_RATE_PACKETS })
            .then(({ bestGuessFrameRate }) =>
              Number.isFinite(bestGuessFrameRate) && bestGuessFrameRate > 0
                ? roundTo(bestGuessFrameRate, 3)
                : null,
            ),
        }
      : null;

    const audio = audioTrack
      ? {
          codec: await audioTrack.getCodec(),
          channels: await audioTrack.getNumberOfChannels(),
          sampleRate: await audioTrack.getSampleRate(),
        }
      : null;

    // Metadata first: computeDuration is exact but may walk every packet,
    // which on an MP3 with no Xing header is the whole file.
    const duration = await input.getDurationFromMetadata();

    const tags = await input.getMetadataTags();
    const year = tags.date?.getUTCFullYear();

    return {
      supported: true,
      container: format.name,
      mimeType: await input.getMimeType(),
      duration: duration === null ? null : roundTo(duration, 3),
      video,
      audio,
      tags: {
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        year: year !== undefined && Number.isFinite(year) ? year : undefined,
        coverArt: (tags.images ?? []).length > 0,
      },
    };
  } finally {
    input.dispose();
  }
}
