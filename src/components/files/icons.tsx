import type { ReactNode } from "react";
import type { FileKind } from "@/lib/files-nav";

// The navigator's icons, drawn as in the approved mockup on a 24×24 stroked
// grid. Plain JSX, so no icon library ships with the island.

type IconProps = { size?: number; strokeWidth?: number; className?: string };

function Svg({
  size = 16,
  strokeWidth = 1.8,
  className,
  fill = "none",
  children,
}: IconProps & { fill?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === "none" ? "currentColor" : "none"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </Svg>
);

const KIND_MARK: Record<FileKind, ReactNode> = {
  image: (
    <>
      <circle cx="10" cy="12" r="1.5" />
      <path d="m19 18-4-4-6 6" />
    </>
  ),
  video: <path d="m10 11 5 3-5 3z" />,
  audio: (
    <>
      <circle cx="10" cy="16" r="2" />
      <path d="M12 16V9l4 1.5" />
    </>
  ),
  archive: (
    <>
      <path d="M11 6h2M11 9h2M11 12h2" />
      <rect x="10" y="14" width="4" height="4" rx="1" />
    </>
  ),
  doc: <path d="M9 13h6M9 17h4" />,
  code: <path d="m10 12-2 2.5 2 2.5M14 12l2 2.5-2 2.5" />,
  text: <path d="M9 12h6M9 15h6M9 18h3" />,
  file: null,
};

export const FileIcon = ({ kind, ...p }: IconProps & { kind: FileKind }) => (
  <Svg strokeWidth={1.7} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    {KIND_MARK[kind]}
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg fill="currentColor" {...p}>
    <path d="M8 5v14l11-7z" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg fill="currentColor" {...p}>
    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg strokeWidth={2.4} {...p}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <rect x="13" y="4" width="7" height="7" rx="1" />
    <rect x="4" y="13" width="7" height="7" rx="1" />
    <rect x="13" y="13" width="7" height="7" rx="1" />
  </Svg>
);
