import { useEffect, useRef, useState } from "react";
import type { Artist, TimeRange, Track } from "@/lib/spotify";
import { cn, formatDuration } from "@/lib/utils";
import { PlayButton } from "./PlayButton";

const RANGES: { id: TimeRange; label: string }[] = [
  { id: "short_term", label: "4 weeks" },
  { id: "medium_term", label: "6 months" },
  { id: "long_term", label: "all time" },
];

type Props = {
  initialRange: TimeRange;
  initialTracks: Track[];
  initialArtists: Artist[];
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
  const [cache, setCache] = useState<Partial<Record<TimeRange, Bucket>>>({
    [initialRange]: {
      tracks: initialTracks,
      artists: initialArtists,
      failed: initialFailed,
    },
  });

  useEffect(() => {
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
    <>
      <div className="mb-4 flex min-h-4 items-center gap-2.5">
        <h2 className="label">Top</h2>
        {items.length > 0 && (
          <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-ink-faint">
            {items.length} {view} · {RANGES.find((option) => option.id === range)?.label}
          </span>
        )}
      </div>

      <div className="mb-[18px] flex flex-wrap items-baseline gap-x-6 gap-y-3 font-mono text-xs">
        <div className="flex gap-4">
          {(["tracks", "artists"] as const).map((option) => (
            <Switch key={option} pressed={view === option} onClick={() => setView(option)}>
              {option}
            </Switch>
          ))}
        </div>

        <span aria-hidden="true" className="hidden text-line-strong sm:inline">/</span>

        <div className="flex gap-4">
          {RANGES.map((option) => (
            <Switch key={option.id} pressed={range === option.id} onClick={() => setRange(option.id)}>
              {option.label}
            </Switch>
          ))}
        </div>

        {loading && <span className="text-ink-faint">loading…</span>}
      </div>

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
          <ol className="divide-y divide-line-soft border-t border-line-soft">
            {/* biome-ignore-start lint/suspicious/noArrayIndexKey: the index
              disambiguates repeated titles. Switching range replaces the whole
              list, so rows never reorder in place. */}
            {(items as Track[]).map((track, i) => (
              <li key={`${track.title}-${i}`} className="row-mark group relative flex items-center gap-3.5 py-2.5">
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
                      className="h-9 w-9 shrink-0 rounded-xs bg-raised object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-xs bg-raised" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <a
                        href={track.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[0.9375rem] text-ink transition-colors after:absolute after:inset-0 group-hover:text-brand-alt"
                      >
                        {track.title}
                      </a>
                      <PlayButton trackId={track.trackId} title={track.title} />
                    </span>
                    <span className="mt-px block truncate text-[12.5px] text-ink-dim">
                      {track.artists}
                    </span>
                  </span>
                  {track.durationMs && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                      {formatDuration(track.durationMs)}
                    </span>
                  )}
              </li>
            ))}
            {/* biome-ignore-end lint/suspicious/noArrayIndexKey: see above */}
          </ol>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-[22px] sm:grid-cols-4">
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
                  <div className="aspect-square overflow-hidden rounded-card bg-raised">
                    {artist.image && (
                      <img
                        src={artist.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-80"
                      />
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm text-ink transition-colors group-hover:text-brand-alt">
                    {artist.name}
                  </p>
                  <p className="font-mono text-[10.5px] tabular-nums text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                </a>
              </li>
            ))}
            {/* biome-ignore-end lint/suspicious/noArrayIndexKey: see above */}
          </ul>
        )}
      </div>
    </>
  );
}

function Switch({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "relative border-b pb-0.5 transition-colors after:absolute after:inset-x-0 after:-inset-y-[0.625rem] after:content-['']",
        pressed
          ? "border-brand text-ink"
          : "border-transparent text-ink-faint hover:text-ink-dim",
      )}
    >
      {children}
    </button>
  );
}
