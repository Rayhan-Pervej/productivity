// Shared helpers for the store slices: undoable changes, block/template mapping, toast ids, the "done" sound.
import type { StoreApi } from "zustand";
import type { Block, Template } from "@/domain/types";
import { playSound } from "@/lib/sounds";
import type { Snapshot, State } from "./types";

export type SetState = StoreApi<State>["setState"];
export type GetState = () => State;

let toastSeq = 0;
/** Next toast id, unique for this app run. */
export const nextToastId = () => ++toastSeq;

/** The helpers bound to this store's set/get, shared by every slice. */
export function makeHelpers(set: SetState, get: GetState) {
  /** Apply a data change with undo support and an optional toast. */
  const change = (fn: (s: State) => Partial<Snapshot>, message?: string) => {
    const s = get();
    const snap: Snapshot = {
      blocks: s.blocks,
      anytime: s.anytime,
      inbox: s.inbox,
      backlog: s.backlog,
      upcoming: s.upcoming,
      templates: s.templates,
      routines: s.routines,
    };
    set({
      ...fn(s),
      history: [...s.history.slice(-29), snap],
      ...(message ? { toast: { id: nextToastId(), message, canUndo: true } } : {}),
    });
  };
  const mapBlock = (id: string, fn: (b: Block) => Block) => (s: State) => ({
    blocks: s.blocks.map((b) => (b.id === id ? fn(b) : b)),
    upcoming: s.upcoming.map((b) => (b.id === id ? { ...fn(b), dayOffset: b.dayOffset } : b)),
  });
  const mapTemplate = (id: string, fn: (t: Template) => Template) => (s: State) => ({
    templates: s.templates.map((t) => (t.id === id ? fn(t) : t)),
  });
  const titleOf = (id: string) => (get().blocks.find((b) => b.id === id) ?? get().upcoming.find((b) => b.id === id))?.title ?? "";
  /** The little "done" sound, if the user wants it. */
  const doneSound = () => {
    if (get().settings.completionSound) playSound("done");
  };
  return { change, mapBlock, mapTemplate, titleOf, doneSound };
}

export type Helpers = ReturnType<typeof makeHelpers>;

/** A slice: some of the state and its actions, built from set/get and the shared helpers. */
export type Slice<K extends keyof State> = (set: SetState, get: GetState, helpers: Helpers) => Pick<State, K>;
