// Horizontal geometry shared by the timeline's pieces. (Vertical rules live in lib/timelineLayout.ts.)

/** Width kept for a background band's label when tasks sit on top of it (CSS var --nest). */
export const NEST_INSET = 148;
/** On a narrow timeline the band's label column shrinks, so tasks keep their width. */
export const NEST_INSET_NARROW = 116;
/** Timeline width (px) below which it counts as narrow. Matches the `@max-[560px]` query in Timeline. */
export const NARROW_TIMELINE = 560;

/** Props a band or block needs to turn pointer positions into times and add something there. */
export interface PlaceProps {
  onAddAt: (minute: number, areaId?: string) => void;
  /** y (px) → minute of the day. */
  unmap: (y: number) => number;
  /** Minute of the day → y (px). */
  map: (minute: number) => number;
}
