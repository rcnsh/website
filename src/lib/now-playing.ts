export type NowPlayingPayload =
  | {
      state: "playing";
      title: string;
      artists: string;
      album: string | null;
      image: string | null;
      url: string | null;
      progressMs: number;
      durationMs: number;
    }
  | {
      state: "recent";
      title: string;
      artists: string;
      album: string | null;
      image: string | null;
      url: string | null;
      playedAt: string;
    }
  | { state: "idle" }
  | { state: "error" };

export const CACHE_SECONDS = 10;

export const PLAY_SETTLE_MS = 3_000;

export const PLAYED_REFRESH_MS = PLAY_SETTLE_MS + 500;

export const END_RETRY_MS = 3_000;
export const END_RETRIES = 8;

export const PLAYED_EVENT = "music:played";
