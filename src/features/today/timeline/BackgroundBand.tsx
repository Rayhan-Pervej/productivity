// A background band on the timeline (Office, time out), and the hover guide that shows the time
// under the cursor. Clicking adds something at that time, in the band's own area.
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { fmtTime } from "@/lib/time";
import { clamp, cn, tint } from "@/lib/utils";
import { showMenu, wantsNativeMenu } from "@/components/ContextMenu";
import { bandMenu } from "@/features/menus";
import type { Block } from "@/domain/types";
import { NARROW_TIMELINE, NEST_INSET, NEST_INSET_NARROW, type PlaceProps } from "./geometry";

export function BackgroundBand({
  block,
  color,
  top,
  height,
  hosting,
  active,
  past,
  now,
  onAddAt,
  unmap,
  map,
}: PlaceProps & {
  block: Block;
  color: string;
  top: number;
  height: number;
  /** Tasks sit on top of it: the label goes in a side column. */
  hosting: boolean;
  active: boolean;
  past: boolean;
  now: number;
}) {
  const [hover, setHover] = useState<{ minute: number; x: number; width: number } | null>(null);

  // Snap to 15 minutes, never before now, and leave room for at least 15 minutes inside the band.
  const earliest = Math.max(block.start, now >= 0 ? Math.ceil(now / 15) * 15 : 0);
  const minuteAt = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = Math.round(unmap(top + (e.clientY - rect.top)) / 15) * 15;
    return Math.min(Math.max(raw, earliest), block.end - 15);
  };
  const canAdd = !past && earliest <= block.end - 15;

  return (
    <button
      type="button"
      disabled={!canAdd}
      aria-label={`Add something during ${block.title}`}
      onMouseMove={(e) => {
        if (!canAdd) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setHover({ minute: minuteAt(e), x: e.clientX - rect.left, width: rect.width });
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => onAddAt(minuteAt(e), block.areaId)}
      onContextMenu={(e) => {
        if (wantsNativeMenu(e.nativeEvent)) return;
        const minute = canAdd ? minuteAt(e) : null;
        showMenu(
          e,
          bandMenu(block, minute, () => minute !== null && onAddAt(minute, block.areaId)),
        );
      }}
      className={cn(
        // No z-index of its own (not z-0): its hover guide must join the timeline's layers, above the
        // row lines (z-1) but below the tasks on it (z-2).
        "absolute flex overflow-hidden rounded-xl px-4 text-left disabled:cursor-default",
        hosting ? "flex-col items-start gap-0.5 pt-2.5" : "items-center gap-2",
        past && "opacity-60",
      )}
      style={{
        left: 8,
        width: "calc(100% - 8px)",
        top,
        height,
        background: `repeating-linear-gradient(135deg, ${tint(color, 8)} 0 8px, ${tint(color, 4)} 8px 16px), var(--bg)`,
      }}
    >
      {hosting ? (
        <>
          <span className="flex max-w-[calc(var(--nest)-16px)] items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate text-[13px] font-medium">{block.title}</span>
            {past && <Check size={13} className="shrink-0 text-muted" />}
          </span>
          <span className="tabular max-w-[calc(var(--nest)-16px)] pl-3.5 text-[11px] text-muted">
            {fmtTime(block.start)} – {fmtTime(block.end)}
          </span>
          {active && <span className="pl-3.5 text-[11px] text-accent">now</span>}
        </>
      ) : (
        <>
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          <span className="text-[13px] font-medium">{block.title}</span>
          {active && <span className="text-[11.5px] text-muted">· now</span>}
          {past && <Check size={13} className="text-muted" />}
          <span className="tabular ml-auto text-[11.5px] text-muted">
            {fmtTime(block.start)} – {fmtTime(block.end)}
          </span>
        </>
      )}

      {hover && (
        <HoverGuide hover={hover} lineY={Math.round(map(hover.minute)) - top} bandHeight={height} color={color} hosting={hosting} />
      )}
    </button>
  );
}

const PILL_H = 20;
const PILL_W = 92;

/**
 * Dashed line at the exact hovered time, plus a "＋ 8:15 AM" pill near the cursor.
 * The line is exact; the pill is kept fully inside the band so it never gets clipped at the edges.
 */
function HoverGuide({
  hover,
  lineY,
  bandHeight,
  color,
  hosting,
}: {
  hover: { minute: number; x: number; width: number };
  lineY: number;
  bandHeight: number;
  color: string;
  hosting: boolean;
}) {
  const pillTop = clamp(lineY - PILL_H / 2, 2, bandHeight - PILL_H - 2);
  // Tasks float on top of a hosting band, so keep the pill in the band's free label column there.
  const pillLeft = hosting
    ? clamp(hover.x - PILL_W / 2, 4, (hover.width + 8 <= NARROW_TIMELINE ? NEST_INSET_NARROW : NEST_INSET) - PILL_W - 4)
    : clamp(hover.x + 14, 4, hover.width - PILL_W - 4);
  return (
    <>
      <span
        className="pointer-events-none absolute right-0 left-0 z-[1] border-t border-dashed"
        style={{ top: lineY, borderColor: color }}
      />
      <span
        className="tabular pointer-events-none absolute z-[1] flex items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-soft"
        style={{ top: pillTop, left: pillLeft, height: PILL_H, background: color }}
      >
        <Plus size={11} strokeWidth={3} /> {fmtTime(hover.minute)}
      </span>
    </>
  );
}
