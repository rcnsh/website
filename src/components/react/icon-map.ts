import {
  Book,
  Crosshair,
  ExternalLink,
  File,
  FileText,
  Home,
  KeyRound,
  Music,
} from "lucide-react";
import { GithubIcon } from "./BrandIcons";

/**
 * Maps the `icon` strings used in src/content/site.json to components.
 * JSON can't hold a component, so this is the one place that has to change
 * when a new icon name is introduced there.
 */
export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  music: Music,
  book: Book,
  file: FileText,
  github: GithubIcon,
  crosshair: Crosshair,
  key: KeyRound,
  link: ExternalLink,
};

export const FALLBACK_ICON = File;

export function iconFor(name?: string) {
  return (name && ICON_MAP[name]) || FALLBACK_ICON;
}
