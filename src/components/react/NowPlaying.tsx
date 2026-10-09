import { useEffect, useRef, useState } from "react";
import { SpotifyIcon } from "./BrandIcons";
import { liveUpdates, onPrefChange } from "@/lib/prefs";
import { cn, formatDuration, relativeTime } from "@/lib/utils";
import "@/components/music/now-playing.css";

type Payload =
  | { state: "playing"; title: string; artists: string; album: string | null; image: string | null; url: string | null; progressMs: number; durationMs: number }
  | { state: "recent"; title: string; artists: string; album: string | null; image: string | null; url: string | null; playedAt: string }
  | { state: "idle" }
  | { state: "error" };

// The bar is interpolated locally between polls, so the cadence only decides
// how fast a *track change* is noticed — and the end of a track is handled
// directly below.
const POLL_MS = 30_000;

// A poll must not outlive its own interval, or requests stack.
const REQUEST_TIMEOUT_MS = 8_000;

// A frozen bar under a "Now playing" label is a worse lie than saying nothing.
const STALE_AFTER_FAILURES = 3;

// Spotify keeps reporting a finished track for a few seconds, and the route
// caches for ten, so one end-of-track refresh usually comes back unchanged.
const END_RETRY_MS = 3_000;
const END_RETRIES = 8;

export default function NowPlaying({
  layout = "home",
}: {
  // "home" is the home page tile's body; "page" the music page's larger one.
  // Either way this renders the whole inside of a tile, head row included.
  layout?: "home" | "page";
}) {
  const [data, setData] = useState<Payload | null>(null);
  // Interpolated between polls so the bar moves every second, not every 20.
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  // A channel between two effects, not something the render reads.
  const refreshRef = useRef<(() => void) | null>(null);
  // Keyed, not a boolean: Spotify briefly keeps reporting the finished track,
  // and a boolean reset per payload would re-fire every second.
  const endRequestedRef = useRef<{ key: string; at: number; tries: number } | null>(null);
  // Consecutive failed polls. Reset by any success.
  const [failures, setFailures] = useState(0);

  // Read lazily so someone who turned it off never gets the mount poll.
  // lib/prefs answers `true` on the server, so hydration matches the markup.
  const [live, setLive] = useState(liveUpdates);

  useEffect(() => {
    const bindings = new AbortController();
    setLive(liveUpdates());
    onPrefChange("live", () => setLive(liveUpdates()), bindings.signal);
    return () => bindings.abort();
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | undefined;

    const load = async () => {
      // Two open requests can land out of order, and the bar jumps backwards.
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]);

      try {
        // no-store: the browser's copy would carry an un-advanced progressMs.
        const response = await fetch("/api/spotify/now-playing", {
          signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));
        const json = (await response.json()) as Payload;
        if (!alive || controller.signal.aborted) return;

        setFailures(0);
        setData(json);
        if (json.state === "playing") {
          progressRef.current = json.progressMs;
          setProgress(json.progressMs);
        }
      } catch {
        // A cancelled request is not a failure — it is us, replacing it.
        if (!alive || controller.signal.aborted) return;
        setFailures((n) => n + 1);
        setData((prev) => prev ?? { state: "error" });
      }
    };

    // Re-armed from the end of each attempt, not on a fixed interval, so a
    // poll can never be scheduled while the previous one is still open.
    const cycle = async () => {
      await load();
      if (alive && live && !document.hidden) timer = setTimeout(cycle, POLL_MS);
    };

    // One request either way; the switch buys everything after it.
    if (!live) {
      void load();
      return () => {
        alive = false;
        inFlight?.abort();
      };
    }

    void cycle();

    // Cancel what was queued, so an immediate refresh does not also leave the
    // old timer to fire seconds later.
    const restart = () => {
      if (timer) clearTimeout(timer);
      void cycle();
    };

    refreshRef.current = restart;

    // Nothing polls while the tab is hidden; re-sync as soon as it is seen.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        restart();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = undefined;
      inFlight?.abort();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      refreshRef.current = null;
      inFlight?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live]);

  useEffect(() => {
    // Interpolating forward on a reading that is no longer being refreshed is
    // inventing progress.
    if (!live || data?.state !== "playing" || failures >= STALE_AFTER_FAILURES) return;

    // Identity, not object equality: every poll makes a new payload. A track
    // repeated back to back is picked up by the ordinary poll instead.
    const trackKey = `${data.title}|${data.durationMs}`;

    // Wall-clock, not +1000 a tick: a throttled timer would otherwise lag.
    let last = performance.now();
    let tick: ReturnType<typeof setInterval> | undefined;

    const step = () => {
      const now = performance.now();
      progressRef.current = Math.min(progressRef.current + (now - last), data.durationMs);
      last = now;
      setProgress(progressRef.current);

      // The one case where the poll cadence would be visible, so ask now, and
      // keep asking briefly while the finished track is still being reported.
      if (progressRef.current < data.durationMs) return;
      const asked = endRequestedRef.current;
      const fresh = asked?.key !== trackKey;
      if (fresh || (asked.tries < END_RETRIES && Date.now() - asked.at >= END_RETRY_MS)) {
        endRequestedRef.current = {
          key: trackKey,
          at: Date.now(),
          tries: fresh ? 1 : asked.tries + 1,
        };
        refreshRef.current?.();
      }
    };

    const start = () => {
      last = performance.now();
      tick = setInterval(step, 1000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        step();
        clearInterval(tick);
      } else {
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [data, live, failures]);

  if (!data) {
    // Mirrors the loaded layout row for row, so real data doesn't move anything.
    return (
      <Frame layout={layout} label={layout === "page" ? "Right now" : "Now playing"}>
        <Body layout={layout}>
          <div className={cn("placeholder-block rounded-card", SIZES[layout].art)} />
          <div className="min-w-0">
            {layout === "page" && <div className="placeholder-block mb-3 h-2.5 w-20 rounded-xs" />}
            <div className={cn("placeholder-block w-3/4 rounded-xs", SIZES[layout].titleBlock)} />
            <div className="placeholder-block mt-2 h-3.5 w-1/2 rounded-xs" />
            <div className="placeholder-block mt-2 h-3 w-2/5 rounded-xs" />
            <div className={cn("flex h-4 items-center", SIZES[layout].slot)}>
              <div className="placeholder-block h-0.5 w-full rounded-xs" />
            </div>
            {layout === "page" && <div className="placeholder-block mt-3.5 h-3 w-48 rounded-xs" />}
          </div>
        </Body>
      </Frame>
    );
  }

  if (data.state === "idle" || data.state === "error") {
    return (
      <Frame layout={layout} label={layout === "page" ? "Right now" : "Now playing"}>
        <Body layout={layout}>
          <Artwork image={null} title="" className={SIZES[layout].art} />
          <div className="min-w-0">
            <p className="text-sm text-ink-dim">
              {data.state === "error" ? "Spotify unavailable" : "Not listening right now"}
            </p>
            {layout === "page" && <LiveLine live={live} trouble={data.state === "error"} />}
          </div>
        </Body>
      </Frame>
    );
  }

  // Keeps the last good track — still the best thing known — but stops
  // asserting it is current, so a dead endpoint cannot read as a paused one.
  const disconnected = failures >= STALE_AFTER_FAILURES;
  const playing = data.state === "playing" && !disconnected;
  const pct = playing ? Math.min((progress / Math.max(data.durationMs, 1)) * 100, 100) : 0;
  const size = SIZES[layout];

  const state = disconnected
    ? "Can't reach Spotify — last known"
    : data.state === "playing"
      ? "Now playing"
      : "Recently played";

  return (
    <Frame
      layout={layout}
      label={layout === "page" ? "Right now" : disconnected ? "Last known" : state}
      playing={playing}
      live={live}
      trackUrl={data.url}
    >
      <Body layout={layout}>
        <Artwork image={data.image} title={data.title} className={size.art} />

        <div className="min-w-0">
          {layout === "page" && (
            <p className={cn("label mb-2.5", playing && "text-brand-alt")}>{state}</p>
          )}

          <p className={cn("line-clamp-2 text-ink", size.title)}>
            {data.url ? (
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-brand-alt"
              >
                {data.title}
              </a>
            ) : (
              data.title
            )}
          </p>
          <p className={cn("truncate text-ink-dim", size.artist)}>{data.artists}</p>
          {data.album && (
            <p className={cn("truncate font-mono text-ink-faint", size.album)}>{data.album}</p>
          )}

          {/* Always present so "playing" and "recently played" are the same
              height — progress when playing, when it was played otherwise. */}
          <div className={cn("flex h-4 items-center gap-2.5", size.slot)}>
            {playing ? (
              <>
                <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-ink-faint">
                  {formatDuration(progress)}
                </span>
                <div
                  role="progressbar"
                  aria-label="Playback progress"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(data.durationMs / 1000)}
                  aria-valuenow={Math.round(progress / 1000)}
                  aria-valuetext={`${formatDuration(progress)} of ${formatDuration(data.durationMs)}`}
                  className="h-0.5 flex-1 overflow-hidden rounded-full bg-line-soft"
                >
                  {/* Keyed so a new track remounts at its start rather than sweeping back. */}
                  <div
                    key={`${data.title}|${data.durationMs}`}
                    className="bg-brand-gradient h-full transition-[width] duration-1000 ease-linear"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-ink-faint">
                  {formatDuration(data.durationMs)}
                </span>
              </>
            ) : (
              <span className="truncate font-mono text-[10.5px] text-ink-faint">
                {data.state === "recent" ? `Played ${relativeTime(data.playedAt)}` : "Position unknown"}
              </span>
            )}
          </div>

          {layout === "page" && <LiveLine live={live} trouble={disconnected} />}
        </div>
      </Body>
    </Frame>
  );
}

const SIZES = {
  home: {
    art: "size-[104px] sm:size-44",
    body: "grid-cols-[104px_minmax(0,1fr)] gap-4 items-center sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-5 sm:items-end",
    title: "text-[17px] font-[550] leading-tight tracking-[-0.015em] sm:text-[21px]",
    titleBlock: "h-5 sm:h-6",
    artist: "mt-1 text-[14.5px]",
    album: "mt-0.5 text-[11.5px]",
    slot: "mt-3.5 sm:mt-[18px]",
  },
  page: {
    art: "size-28 sm:size-[236px]",
    body: "grid-cols-[112px_minmax(0,1fr)] gap-4 items-center sm:grid-cols-[236px_minmax(0,1fr)] sm:gap-[26px] sm:items-end",
    title: "text-[19px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[28px]",
    titleBlock: "h-6 sm:h-8",
    artist: "mt-1.5 text-sm sm:text-[16px]",
    album: "mt-1 text-xs",
    slot: "mt-3.5 sm:mt-[22px]",
  },
} as const;

type Layout = keyof typeof SIZES;

/** The tile's head row and a column that fills whatever height the tile has. */
function Frame({
  layout,
  label,
  playing = false,
  live = true,
  trackUrl = null,
  children,
}: {
  layout: Layout;
  label: string;
  playing?: boolean;
  live?: boolean;
  trackUrl?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="mb-4 flex min-h-4 items-center gap-2.5">
        <h2
          className={cn("label inline-flex items-center gap-2", playing && "text-brand-alt")}
        >
          {playing && (
            <span className="np-eq" data-moving={live || undefined} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
          {label}
        </h2>
        {layout === "home" ? (
          <a
            href="/music"
            className="ml-auto whitespace-nowrap font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
          >
            Music →
          </a>
        ) : (
          trackUrl && (
            <a
              href={trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto whitespace-nowrap font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
            >
              Open in Spotify ↗
            </a>
          )
        )}
      </div>
      {children}
    </div>
  );
}

function Body({ layout, children }: { layout: Layout; children: React.ReactNode }) {
  return <div className={cn("grid flex-1", SIZES[layout].body)}>{children}</div>;
}

function LiveLine({ live, trouble }: { live: boolean; trouble: boolean }) {
  return (
    <p className="mt-3.5 flex items-center gap-2 font-mono text-[11px] text-ink-faint">
      <i
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", !live ? "bg-ink-faint" : trouble ? "bg-warn" : "bg-ok")}
      />
      {live ? (
        <span>
          Live · <span className="max-sm:hidden">checks Spotify </span>every {POLL_MS / 1000}s
        </span>
      ) : (
        "Live updates off · as of page load"
      )}
    </p>
  );
}

/**
 * Cross-fades between covers. The outgoing frame stays mounted underneath so
 * the tile never flashes empty; the first frame does not animate.
 */
function Artwork({
  image,
  title,
  className,
}: {
  image: string | null;
  title: string;
  className: string;
}) {
  const id = image ?? title;
  // Either [current], or [outgoing, incoming] while a fade is in flight.
  const [frames, setFrames] = useState([{ id, image, ready: true }]);

  useEffect(() => {
    setFrames((prev) => {
      const current = prev[prev.length - 1]!;
      return current.id === id
        ? prev
        : [{ ...current, ready: true }, { id, image, ready: !image }];
    });
  }, [id, image]);

  // The fade waits for the cover to load, or it would fade in nothing.
  const ready = (frameId: string) =>
    setFrames((prev) =>
      prev.map((frame) => (frame.id === frameId ? { ...frame, ready: true } : frame)),
    );

  // Drop the outgoing layer once the incoming one has finished arriving.
  const settle = () =>
    setFrames((prev) => (prev.length > 1 ? prev.slice(-1) : prev));

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-card bg-raised shadow-[0_14px_34px_-14px_rgba(0,0,0,0.75)]",
        className,
      )}
    >
      {frames.map((frame, index) => (
        <div
          key={frame.id}
          onAnimationEnd={settle}
          className={cn(
            "absolute inset-0",
            index > 0 && (frame.ready ? "animate-art-in" : "opacity-0"),
          )}
        >
          {frame.image ? (
            <img
              src={frame.image}
              alt=""
              width={236}
              height={236}
              decoding="async"
              onLoad={() => ready(frame.id)}
              onError={() => ready(frame.id)}
              className="h-full w-full bg-raised object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-raised">
              <SpotifyIcon className="h-7 w-7 text-ink-faint" />
            </div>
          )}
        </div>
      ))}
      {/* A hairline inside the cover's edge, so a dark sleeve still has one. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" />
    </div>
  );
}
