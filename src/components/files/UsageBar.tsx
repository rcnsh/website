import { useEffect, useState } from "react";
import type { HiddenTotals } from "@/lib/bucket-totals";
import { kindTotals, type KindTotal } from "@/lib/files-nav";
import { formatBytes } from "@/lib/utils";
import { KIND_COLOUR, KIND_LABEL, PRIVATE_COLOUR, PRIVATE_LABEL } from "./kinds";
import { subscribeOwnerTree } from "./owner-view";

interface Props {
  kinds: KindTotal[];
  /** Bytes visitors are not shown, drawn as one grey share. Absent for the owner. */
  hidden?: HiddenTotals | null;
  /** Keys in the owner's view. Both views are padded to the larger count, so the tile is one height for either. */
  ownerSlots?: number;
}

type Segment = { key: string; label: string; colour: string; objects: number; bytes: number };

const count = (n: number) => n.toLocaleString("en-GB");

/**
 * The usage bar and its key. Visitors get the listed files by kind plus one
 * private share; once the browser has the owner's full tree, every file is
 * counted by its kind and the private share goes.
 */
export default function UsageBar({ kinds: visitorKinds, hidden: visitorHidden, ownerSlots = 0 }: Props) {
  const [view, setView] = useState({ kinds: visitorKinds, hidden: visitorHidden, owner: false });

  useEffect(
    () => subscribeOwnerTree((tree) => setView({ kinds: kindTotals(tree), hidden: null, owner: true })),
    [],
  );

  const segments: Segment[] = view.kinds.map((k) => ({
    key: k.kind,
    label: KIND_LABEL[k.kind],
    colour: KIND_COLOUR[k.kind],
    objects: k.objects,
    bytes: k.bytes,
  }));
  if (view.hidden && view.hidden.objects > 0) {
    segments.push({ key: "private", label: PRIVATE_LABEL, colour: PRIVATE_COLOUR, ...view.hidden });
  }
  const total = segments.reduce((sum, s) => sum + s.bytes, 0);
  // Either view may have more keys than the other; both take the larger count.
  const visitorSlots = visitorKinds.length + (visitorHidden && visitorHidden.objects > 0 ? 1 : 0);
  const padding = Math.max(0, Math.max(ownerSlots, visitorSlots) - segments.length);

  return (
    <div className="contents" data-owner-view={view.owner ? "owner" : "visitor"}>
      <div
        className="group mt-1 flex h-3 gap-0.5 overflow-hidden rounded-[3px]"
        role="img"
        aria-label={`Bucket usage by file type: ${segments
          .map((s) => `${s.label} ${Math.round((s.bytes / total) * 100)}%`)
          .join(", ")}`}
      >
        {segments.map((s) => (
          <i
            key={s.key}
            className="block h-full min-w-[3px] transition-opacity duration-200 group-hover:opacity-50 hover:opacity-100!"
            style={{ flex: `${s.bytes} 1 0`, background: s.colour }}
            title={`${s.label} — ${formatBytes(s.bytes)}, ${count(s.objects)} file${s.objects === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <ul className="mt-auto grid grid-cols-2 gap-x-4.5 gap-y-3.5 pt-5.5 min-[641px]:grid-cols-3 min-[1021px]:grid-cols-4">
        {segments.map((s) => (
          <li key={s.key} className="flex flex-col gap-1 font-mono text-[11px] text-ink-faint">
            <b className="flex items-center gap-1.75 text-[15px] font-semibold tracking-[-0.02em] text-ink tabular-nums">
              <i className="size-2 shrink-0 rounded-[2px]" style={{ background: s.colour }} />
              {formatBytes(s.bytes)}
            </b>
            {s.label} · {count(s.objects)}
          </li>
        ))}
        {Array.from({ length: padding }, (_, i) => (
          <li key={`pad-${i}`} aria-hidden="true" className="invisible flex flex-col gap-1 font-mono text-[11px]">
            <b className="text-[15px] font-semibold">0 B</b>-
          </li>
        ))}
      </ul>
    </div>
  );
}
