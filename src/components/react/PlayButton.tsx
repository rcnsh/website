import { PLAY_ICON } from "@/components/icons";
import { PLAY_CLASS, playButtonAttributes } from "@/lib/track-play";

/** PlayButton.astro's counterpart: shown to the owner only, played by PlayOnSpotify. */
export function PlayButton({ trackId, title }: { trackId: string | null | undefined; title: string }) {
  if (!trackId) return null;
  return (
    <button type="button" className={PLAY_CLASS} {...playButtonAttributes(trackId, title)}>
      <svg
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-2.5 w-2.5 fill-current"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant from icons.ts, not user input.
        dangerouslySetInnerHTML={{ __html: PLAY_ICON }}
      />
    </button>
  );
}
