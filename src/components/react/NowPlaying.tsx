import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SpotifyIcon } from "./BrandIcons";
import { formatDuration, relativeTime } from "@/lib/utils";

type Payload =
  | { state: "playing"; title: string; artists: string; album: string | null; image: string | null; url: string | null; progressMs: number; durationMs: number }
  | { state: "recent"; title: string; artists: string; album: string | null; image: string | null; url: string | null; playedAt: string }
  | { state: "idle" }
  | { state: "error" };

const POLL_MS = 20_000;

export default function NowPlaying() {
  const [data, setData] = useState<Payload | null>(null);
  // Interpolated locally between polls so the bar moves every second rather
  // than jumping every 20.
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch("/api/spotify/now-playing", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const json = (await response.json()) as Payload;
        if (!alive) return;
        setData(json);
        if (json.state === "playing") {
          progressRef.current = json.progressMs;
          setProgress(json.progressMs);
        }
      } catch {
        if (alive) setData((prev) => prev ?? { state: "error" });
      }
    };

    load();
    const poll = setInterval(load, POLL_MS);

    // Re-sync as soon as the tab is looked at again.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      controller.abort();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (data?.state !== "playing") return;
    const tick = setInterval(() => {
      progressRef.current = Math.min(progressRef.current + 1000, data.durationMs);
      setProgress(progressRef.current);
    }, 1000);
    return () => clearInterval(tick);
  }, [data]);

  if (!data) {
    // Mirrors the loaded layout row for row — art, label, title, artist, and
    // the fourth line — so swapping in real data doesn't move anything.
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

  const playing = data.state === "playing";
  const pct = playing ? Math.min((progress / Math.max(data.durationMs, 1)) * 100, 100) : 0;

  return (
    <Shell>
      {/* initial={false} so the artwork is visible without a frame loop. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={data.image ?? data.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="relative shrink-0"
        >
          {data.image ? (
            <img
              src={data.image}
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
        </motion.div>
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          {playing ? (
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
          Fourth line, always present so "playing" and "recently played" are
          the same height. Playing gets the progress bar; otherwise the album
          fills the slot rather than leaving it blank.
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
 * Fixed-height frame shared by every state.
 *
 * Without it the widget was 56px as a skeleton, 87px playing, 62px recently
 * played and 20px when idle — so everything below it jumped as the fetch
 * resolved. Reserving the tallest layout once means the content can change
 * without moving the page.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[5.5rem] items-center gap-4">{children}</div>
  );
}
