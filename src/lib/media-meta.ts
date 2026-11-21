import { ALL_FORMATS, CustomSource, Input } from "mediabunny";

export type RangeBucket = {
  get(
    key: string,
    options: { range: { offset: number; length: number } },
  ): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

export const READ_BUDGET = { reads: 48, bytes: 24 * 1024 * 1024 };

export class ReadBudgetExceeded extends Error {
  constructor(what: string) {
    super(`Metadata read budget exceeded: ${what}`);
    this.name = "ReadBudgetExceeded";
  }
}

export type ReadStats = { reads: number; bytes: number };

export function bucketSource(
  bucket: RangeBucket,
  key: string,
  size: number,
  stats: ReadStats = { reads: 0, bytes: 0 },
  budget = READ_BUDGET,
): CustomSource {
  return new CustomSource({
    getSize: () => size,
    read: async (start, end) => {
      const length = end - start;
      stats.reads += 1;
      stats.bytes += length;
      if (stats.reads > budget.reads) throw new ReadBudgetExceeded("reads");
      if (stats.bytes > budget.bytes) throw new ReadBudgetExceeded("bytes");

      const object = await bucket.get(key, { range: { offset: start, length } });
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
      duration: number | null;
      video: {
        codec: string | null;
        width: number;
        height: number;
        rotation: number;
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

const FRAME_RATE_PACKETS = 90;

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

export async function readMediaMeta(source: CustomSource): Promise<MediaMeta> {
  const input = new Input({ source, formats: ALL_FORMATS });

  try {
    if (!(await input.canRead())) return { supported: false };

    const format = await input.getFormat();
    const [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
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
