import { useEffect, useRef, useState } from "react";
import { SpotifyIcon } from "./BrandIcons";
import { END_RETRIES, END_RETRY_MS, PLAYED_EVENT, PLAYED_REFRESH_MS, type NowPlayingPayload as Payload } from "@/lib/now-playing";
import { publishCover } from "@/lib/lattice-source";
import { liveUpdates, onPrefChange } from "@/lib/prefs";
import { cn, formatDuration, relativeTime } from "@/lib/utils";
import "@/components/music/now-playing.css";

const POLL_MS = 30_000;

const REQUEST_TIMEOUT_MS = 8_000;

const STALE_AFTER_FAILURES = 3;

export default function NowPlaying({
  layout = "home",
}: {
  layout?: "home" | "page";
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const refreshRef = useRef<(() => void) | null>(null);
  const endRequestedRef = useRef<{ key: string; at: number; tries: number } | null>(null);
  const [failures, setFailures] = useState(0);

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
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]);

      try {
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
        if (!alive || controller.signal.aborted) return;
        setFailures((n) => n + 1);
        setData((prev) => prev ?? { state: "error" });
      }
    };

    const cycle = async () => {
      await load();
      if (alive && live && !document.hidden) timer = setTimeout(cycle, POLL_MS);
    };

    if (!live) {
      void load();
      return () => {
        alive = false;
        inFlight?.abort();
      };
    }

    void cycle();

    const restart = () => {
      if (timer) clearTimeout(timer);
      void cycle();
    };

    refreshRef.current = restart;

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

    const onPlayed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(restart, PLAYED_REFRESH_MS);
    };
    document.addEventListener(PLAYED_EVENT, onPlayed);

    return () => {
      alive = false;
      refreshRef.current = null;
      inFlight?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener(PLAYED_EVENT, onPlayed);
    };
  }, [live]);

  useEffect(() => {
    if (!live || data?.state !== "playing" || failures >= STALE_AFTER_FAILURES) return;

    const trackKey = `${data.title}|${data.durationMs}`;

    let last = performance.now();
    let tick: ReturnType<typeof setInterval> | undefined;

    const step = () => {
      const now = performance.now();
      progressRef.current = Math.min(progressRef.current + (now - last), data.durationMs);
      last = now;
      setProgress(progressRef.current);

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

  const cover = data && "image" in data ? data.image : null;
  const coverLabel = data && "title" in data ? `${data.title}, ${data.artists}` : "";
  const coverLive = data?.state === "playing" && failures < STALE_AFTER_FAILURES;
  useEffect(() => {
    if (!data) return;
    publishCover(cover ? { image: cover, label: coverLabel, live: coverLive } : null);
  }, [data, cover, coverLabel, coverLive]);

  if (!data) {
    const size = SIZES[layout];
    return (
      <Frame layout={layout} label={layout === "page" ? "Right now" : "Now playing"}>
        <Body layout={layout} aria-hidden="true">
          <div className={cn("placeholder-block rounded-card", size.art)} />
          <div className="min-w-0">
            {layout === "page" && (
              <p className="label mb-2.5">
                <Bar className="w-20" />
              </p>
            )}
            <p className={size.title}>
              <Bar className="w-3/4" />
            </p>
            <p className={size.artist}>
              <Bar className="w-1/2" />
            </p>
            <p className={cn("font-mono", size.album)}>
              <Bar className="w-2/5" />
            </p>
            <div className={cn("flex h-4 items-center", size.slot)}>
              <div className="placeholder-block h-0.5 w-full rounded-xs" />
            </div>
            {layout === "page" && (
              <p className="mt-3.5 font-mono text-[11px]">
                <Bar className="w-48" />
              </p>
            )}
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
                  <div
                    key={`${data.title}|${data.durationMs}`}
                    className="bg-brand-gradient h-full origin-left transition-transform duration-1000 ease-linear"
                    style={{ transform: `scaleX(${pct / 100})` }}
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
    artist: "mt-1 text-[14.5px]",
    album: "mt-0.5 text-[11.5px]",
    slot: "mt-3.5 sm:mt-[18px]",
  },
  page: {
    art: "size-28 sm:size-[236px]",
    body: "grid-cols-[112px_minmax(0,1fr)] gap-4 items-center sm:grid-cols-[236px_minmax(0,1fr)] sm:gap-[26px] sm:items-end",
    title: "text-[19px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[28px]",
    artist: "mt-1.5 text-sm sm:text-[16px]",
    album: "mt-1 text-xs",
    slot: "mt-3.5 sm:mt-[22px]",
  },
} as const;

type Layout = keyof typeof SIZES;

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
      <div
        className={cn(
          "mb-4 flex items-center gap-2.5",
          layout === "page" ? "min-h-[calc(0.6875rem*1.5+0.6rem)]" : "min-h-4",
        )}
      >
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
            className="ml-auto whitespace-nowrap rule-link font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
          >
            Music →
          </a>
        ) : (
          trackUrl && (
            <a
              href={trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto whitespace-nowrap rule-link font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
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

function Body({
  layout,
  children,
  ...rest
}: { layout: Layout; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("grid flex-1", SIZES[layout].body)} {...rest}>
      {children}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <span className={cn("placeholder-text", className)} />;
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
  const [frames, setFrames] = useState([{ id, image, ready: !image }]);

  useEffect(() => {
    setFrames((prev) => {
      const current = prev[prev.length - 1]!;
      return current.id === id
        ? prev
        : [{ ...current, ready: true }, { id, image, ready: !image }];
    });
  }, [id, image]);

  const ready = (frameId: string) =>
    setFrames((prev) =>
      prev.map((frame) => (frame.id === frameId ? { ...frame, ready: true } : frame)),
    );

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
            index === 0 && !frame.ready && "placeholder-block",
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
              className={cn("h-full w-full object-cover", frame.ready ? "bg-raised" : "opacity-0")}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-raised">
              <SpotifyIcon className="h-7 w-7 text-ink-faint" />
            </div>
          )}
        </div>
      ))}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" />
    </div>
  );
}
