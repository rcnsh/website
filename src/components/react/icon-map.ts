import {
  Book,
  Crosshair,
  ExternalLink,
  File,
  FileText,
  Home,
  KeyRound,
  Music,
  PenLine,
  Rss,
} from "lucide-react";
import { GithubIcon } from "./BrandIcons";

/**
 * Maps the `icon` strings in src/content/site.json to components. Add a name
 * here before using it there.
 */
export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  pen: PenLine,
  music: Music,
  book: Book,
  file: FileText,
  rss: Rss,
  github: GithubIcon,
  crosshair: Crosshair,
  key: KeyRound,
  link: ExternalLink,
};

export const FALLBACK_ICON = File;

export function iconFor(name?: string) {
  return (name && ICON_MAP[name]) || FALLBACK_ICON;
}
