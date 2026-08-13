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
};

type Bucket = { tracks: Track[]; artists: Artist[]; failed?: boolean };

export default function MusicExplorer({
  initialRange,
  initialTracks,
  initialArtists,
}: Props) {
  const [range, setRange] = useState<TimeRange>(initialRange);
  const [view, setView] = useState<"tracks" | "artists">("tracks");
  const [loading, setLoading] = useState(false);
  // Ranges already fetched are kept so toggling back is instant.
  const [cache, setCache] = useState<Partial<Record<TimeRange, Bucket>>>({
    [initialRange]: { tracks: initialTracks, artists: initialArtists },
  });

  useEffect(() => {
    if (cache[range]) return;

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
    Stale-while-revalidate. Switching to an un-fetched range used to leave
    `items` undefined for the length of the round trip, which fell through to
    the empty state — so changing period flashed a "no data" message at you.
    Keeping the last resolved range on screen means there is never an empty
    frame to see; it just dims until the new data lands.
  */
  const lastResolved = useRef<Bucket>({
    tracks: initialTracks,
    artists: initialArtists,
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
      <div className="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 font-mono text-xs">
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

        <span className="text-line-strong">/</span>

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

      {/*
        While a new range is in flight the previous one stays put and just
        dims, and pointer events are off so you can't click a row that's about
        to be replaced.
      */}
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
        </ol>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
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
        </ul>
      )}
      </div>
    </section>
  );
}
