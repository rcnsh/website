import { useEffect, useRef, useState } from "react";
import { SpotifyIcon } from "./BrandIcons";
import { liveUpdates, onPrefChange } from "@/lib/prefs";
import { cn, formatDuration, relativeTime } from "@/lib/utils";

type Payload =
  | { state: "playing"; title: string; artists: string; album: string | null; image: string | null; url: string | null; progressMs: number; durationMs: number }
  | { state: "recent"; title: string; artists: string; album: string | null; image: string | null; url: string | null; playedAt: string }
  | { state: "idle" }
  | { state: "error" };

const POLL_MS = 20_000;

/*
  A poll must not outlive its own interval, or a slow endpoint stacks requests
  faster than they drain.
*/
const REQUEST_TIMEOUT_MS = 8_000;

/*
  How many polls in a row must fail before the card stops claiming to be live.
  One is noise — a dropped connection on a phone — but three in a minute means
  the reading on screen is not current, and a frozen progress bar under a "Now
  playing" label is a worse lie than saying nothing.
*/
const STALE_AFTER_FAILURES = 3;

export default function NowPlaying() {
  const [data, setData] = useState<Payload | null>(null);
  // Interpolated between polls so the bar moves every second, not every 20.
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  // Consecutive failed polls. Reset by any success.
  const [failures, setFailures] = useState(0);

  // The live-updates switch, read lazily so someone who turned it off never
  // gets the mount poll. lib/prefs answers `true` on the server, so hydration
  // matches the markup.
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
      /*
        Abort whatever is still running before starting another. With
        setInterval a response slower than POLL_MS meant two requests open at
        once, and whichever landed last won — so an older reading could
        overwrite a newer one and the bar would jump backwards.
      */
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]);

      try {
        const response = await fetch("/api/spotify/now-playing", { signal });
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

    /*
      Re-armed from the end of each attempt rather than on a fixed interval, so
      the next poll cannot be scheduled while the previous one is still open.
      Stacking is structurally impossible rather than merely unlikely.
    */
    const cycle = async () => {
      await load();
      if (alive && live) timer = setTimeout(cycle, POLL_MS);
    };

    /* One request either way — an empty panel is a worse answer than a stale
       one. The switch buys everything after: no interval, no refocus refetch. */
    if (!live) {
      void load();
      return () => {
        alive = false;
        inFlight?.abort();
      };
    }

    void cycle();

    // Re-sync as soon as the tab is looked at again.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void cycle();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      inFlight?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live]);

  useEffect(() => {
    // Interpolating a progress bar is exactly the kind of motion-without-news
    // the switch is there to stop, and it would drift away from a reading that
    // is no longer being refreshed anyway.
    // Also stops once the endpoint is unreachable: interpolating a bar forward
    // on a reading we can no longer refresh is inventing progress.
    if (!live || data?.state !== "playing" || failures >= STALE_AFTER_FAILURES) return;
    const tick = setInterval(() => {
      progressRef.current = Math.min(progressRef.current + 1000, data.durationMs);
      setProgress(progressRef.current);
    }, 1000);
    return () => clearInterval(tick);
  }, [data, live, failures]);

  if (!data) {
    // Mirrors the loaded layout row for row, so real data doesn't move anything.
    return (
      <Shell>
        <div className="placeholder-block h-14 w-14 shrink-0 rounded-xs" />
        <div className="min-w-0 flex-1">
          <div className="placeholder-block h-2.5 w-20 rounded-xs" />
          <div className="placeholder-block mt-2 h-3.5 w-48 rounded-xs" />
          <div className="placeholder-block mt-1.5 h-3 w-32 rounded-xs" />
          <div className="placeholder-block mt-3 h-2 w-full rounded-xs" />
        </div>
      </Shell>
    );
  }

  if (data.state === "idle" || data.state === "error") {
    return (
      <Shell>
        <p className="flex items-center gap-2.5 text-sm text-ink-faint">
          <SpotifyIcon className="h-4 w-4" />
          {data.state === "error"
            ? "Spotify unavailable"
            : "Not listening right now"}
        </p>
      </Shell>
    );
  }

  /*
    Once the card had data, every later failure was invisible: the last good
    reading stayed on screen under a "Now playing" label with a bar still
    interpolating, so a dead endpoint looked exactly like a paused track. After
    a few consecutive failures the card keeps the track — it is still the best
    thing we know — but stops asserting that it is current.
  */
  const disconnected = failures >= STALE_AFTER_FAILURES;
  const playing = data.state === "playing" && !disconnected;
  const pct = playing ? Math.min((progress / Math.max(data.durationMs, 1)) * 100, 100) : 0;

  return (
    <Shell>
      <Artwork image={data.image} title={data.title} />

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          {disconnected ? (
            "Can't reach Spotify — last known"
          ) : data.state === "playing" ? (
            <span className="text-brand">Now playing</span>
          ) : (
            `Played ${relativeTime(data.playedAt)}`
          )}
        </p>

        <a
          href={data.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block truncate text-[0.9375rem] text-ink transition-colors hover:text-brand"
        >
          {data.title}
        </a>
        <p className="truncate text-sm text-ink-dim">{data.artists}</p>

        {/*
          Always present so "playing" and "recently played" are the same
          height — progress bar when playing, album name otherwise.
        */}
        <div className="mt-2.5 flex h-3.5 items-center gap-2.5">
          {playing ? (
            <>
              <div className="h-px flex-1 bg-line">
                <div
                  className="h-px bg-brand transition-[width] duration-1000 ease-linear"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
                {formatDuration(progress)} / {formatDuration(data.durationMs)}
              </span>
            </>
          ) : (
            <span className="truncate font-mono text-[10px] text-ink-faint">
              {data.album ?? ""}
            </span>
          )}
        </div>
      </div>
    </Shell>
  );
}

/**
 * Cross-fades between covers. The outgoing frame stays mounted underneath so
 * the tile never flashes empty; the first frame does not animate.
 */
function Artwork({ image, title }: { image: string | null; title: string }) {
  const id = image ?? title;
  // Either [current], or [outgoing, incoming] while a fade is in flight.
  const [frames, setFrames] = useState([{ id, image }]);

  useEffect(() => {
    setFrames((prev) => {
      const current = prev[prev.length - 1]!;
      return current.id === id ? prev : [current, { id, image }];
    });
  }, [id, image]);

  // Drop the outgoing layer once the incoming one has finished arriving.
  const settle = () =>
    setFrames((prev) => (prev.length > 1 ? prev.slice(-1) : prev));

  return (
    <div className="relative h-14 w-14 shrink-0">
      {frames.map((frame, index) => (
        <div
          key={frame.id}
          onAnimationEnd={settle}
          className={cn("absolute inset-0", index > 0 && "animate-art-in")}
        >
          {frame.image ? (
            <img
              src={frame.image}
              alt=""
              width={56}
              height={56}
              loading="lazy"
              className="h-14 w-14 rounded-xs object-cover"
            />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-xs bg-raised">
              <SpotifyIcon className="h-5 w-5 text-ink-faint" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Fixed-height frame shared by every state, so the page doesn't jump as the
 * fetch resolves.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[5.5rem] items-center gap-4">{children}</div>
  );
}
