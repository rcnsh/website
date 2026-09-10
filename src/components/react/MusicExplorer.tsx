import { useEffect, useRef, useState } from "react";
import type { Artist, TimeRange, Track } from "@/lib/spotify";
import { cn, formatDuration } from "@/lib/utils";

const RANGES: { id: TimeRange; label: string }[] = [
  { id: "short_term", label: "4 weeks" },
  { id: "medium_term", label: "6 months" },
  { id: "long_term", label: "all time" },
];

type Props = {
  initialRange: TimeRange;
  initialTracks: Track[];
  initialArtists: Artist[];
  /*
    Whether the server-rendered range failed to load. Without it a warehouse
    outage arrives as two empty arrays, indistinguishable from a genuinely
    empty listening history — the island would say "Nothing listened to in this
    period" about an upstream being down. Ranges fetched client-side already
    carry this; only the seeded one was missing it.
  */
  initialFailed?: boolean;
};

type Bucket = { tracks: Track[]; artists: Artist[]; failed?: boolean };

export default function MusicExplorer({
  initialRange,
  initialTracks,
  initialArtists,
  initialFailed = false,
}: Props) {
  const [range, setRange] = useState<TimeRange>(initialRange);
  const [view, setView] = useState<"tracks" | "artists">("tracks");
  const [loading, setLoading] = useState(false);
  // Ranges already fetched are kept so toggling back is instant.
  const [cache, setCache] = useState<Partial<Record<TimeRange, Bucket>>>({
    [initialRange]: {
      tracks: initialTracks,
      artists: initialArtists,
      failed: initialFailed,
    },
  });

  useEffect(() => {
    /*
      Reset here, not just in the fetch's `finally`. That `finally` is guarded
      on `alive`, so switching range mid-flight skips it — and if the range
      switched to is already cached, this early return used to fire without
      ever clearing the flag. The spinner then stayed up forever on a range
      whose data was sitting right there.
    */
    if (cache[range]) {
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    fetch(`/api/spotify/top?range=${range}`)
      .then((r) => r.json() as Promise<Bucket & { error?: boolean }>)
      .then((data) => {
        if (!alive) return;
        setCache((prev) => ({
          ...prev,
          [range]: {
            tracks: data.tracks ?? [],
            artists: data.artists ?? [],
            failed: Boolean(data.error),
          },
        }));
      })
      .catch(() => {
        if (alive)
          setCache((prev) => ({
            ...prev,
            [range]: { tracks: [], artists: [], failed: true },
          }));
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [range, cache]);

  const bucket = cache[range];

  /*
    Keeping the last resolved range on screen means switching to an un-fetched
    one dims rather than flashing the empty state for the round trip.
  */
  const lastResolved = useRef<Bucket>({
    tracks: initialTracks,
    artists: initialArtists,
    failed: initialFailed,
  });
  useEffect(() => {
    if (bucket) lastResolved.current = bucket;
  }, [bucket]);

  const shown = bucket ?? lastResolved.current;
  const items = view === "tracks" ? shown.tracks : shown.artists;
  const stale = !bucket;

  return (
    <section>
      {/* Text switches with an underline, rather than filled segmented pills. */}
      {/* Between-group gap has to clearly beat the gap-4 inside each group,
          or the six buttons read as one undifferentiated run. */}
      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-3 font-mono text-xs">
        <div className="flex gap-4">
          {(["tracks", "artists"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={cn(
                "pb-0.5 transition-colors",
                view === option
                  ? "border-b border-brand text-ink"
                  : "border-b border-transparent text-ink-faint hover:text-ink-dim",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {/* The row wraps below sm, and a separator stranded at the end of the
            first line reads as a stray character. */}
        <span className="hidden text-line-strong sm:inline">/</span>

        <div className="flex gap-4">
          {RANGES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRange(option.id)}
              className={cn(
                "pb-0.5 transition-colors",
                range === option.id
                  ? "border-b border-brand text-ink"
                  : "border-b border-transparent text-ink-faint hover:text-ink-dim",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading && <span className="text-ink-faint">loading…</span>}
      </div>

      {/* Pointer events off while stale, so you can't click a row about to be replaced. */}
      <div
        className={cn(
          "transition-opacity duration-200",
          stale && "pointer-events-none opacity-40",
        )}
        aria-busy={stale || undefined}
      >
        {items.length === 0 ? (
          <p className="py-6 text-sm text-ink-faint">
            {shown.failed
              ? "Couldn't reach Spotify just now."
              : `Nothing listened to in this period.`}
          </p>
        ) : view === "tracks" ? (
          <ol className="divide-y divide-line border-y border-line">
            {/* biome-ignore-start lint/suspicious/noArrayIndexKey: the index
              disambiguates repeated titles. Switching range replaces the whole
              list, so rows never reorder in place. */}
            {(items as Track[]).map((track, i) => (
              <li key={`${track.title}-${i}`}>
                <a
                  href={track.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 py-2.5"
                >
                  <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {track.image ? (
                    <img
                      src={track.image}
                      alt=""
                      width={36}
                      height={36}
                      loading="lazy"
                      className="h-9 w-9 shrink-0 rounded-xs object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-xs bg-raised" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] text-ink transition-colors group-hover:text-brand">
                      {track.title}
                    </span>
                    <span className="block truncate text-xs text-ink-dim">
                      {track.artists}
                    </span>
                  </span>
                  {track.durationMs && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                      {formatDuration(track.durationMs)}
                    </span>
                  )}
                </a>
              </li>
            ))}
            {/* biome-ignore-end lint/suspicious/noArrayIndexKey: see above */}
          </ol>
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
            {/* biome-ignore-start lint/suspicious/noArrayIndexKey: as above —
              repeated names, and the list is replaced wholesale. */}
            {(items as Artist[]).map((artist, i) => (
              <li key={`${artist.name}-${i}`}>
                <a
                  href={artist.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <div className="aspect-square overflow-hidden rounded-xs bg-raised">
                    {artist.image && (
                      <img
                        src={artist.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-80"
                      />
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm text-ink transition-colors group-hover:text-brand">
                    {artist.name}
                  </p>
                  <p className="font-mono text-[10px] text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                </a>
              </li>
            ))}
            {/* biome-ignore-end lint/suspicious/noArrayIndexKey: see above */}
          </ul>
        )}
      </div>
    </section>
  );
}
