import { useEffect, useState } from "react";
import type { HiddenTotals } from "@/lib/bucket-totals";
import { kindTotals, type KindTotal } from "@/lib/files-nav";
import { formatBytes } from "@/lib/utils";
import { KIND_COLOUR, KIND_LABEL, PRIVATE_COLOUR, PRIVATE_LABEL } from "./kinds";
import { subscribeOwnerTree } from "./owner-tree";

interface Props {
  kinds: KindTotal[];
  /** Bytes visitors are not shown, drawn as one grey share. Absent for the owner. */
  hidden?: HiddenTotals | null;
}

type Segment = { key: string; label: string; colour: string; objects: number; bytes: number };

const count = (n: number) => n.toLocaleString("en-GB");

/**
 * The usage bar and its key. Visitors get the listed files by kind plus one
 * private share; once the browser has the owner's full tree, every file is
 * counted by its kind and the private share goes.
 */
export default function UsageBar({ kinds: visitorKinds, hidden: visitorHidden }: Props) {
  const [view, setView] = useState({ kinds: visitorKinds, hidden: visitorHidden });

  useEffect(() => subscribeOwnerTree((tree) => setView({ kinds: kindTotals(tree), hidden: null })), []);

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

  return (
    <>
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
      </ul>
    </>
  );
}
