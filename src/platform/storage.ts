// Where the app's state is saved.
//  - Desktop app: the SQLite database in the Rust core (`load_state` / `save_state`).
//  - Browser (development): localStorage.
//
// Safety rules:
//  1. Nothing is saved until the saved state has been loaded (otherwise the empty startup
//     state could overwrite real data).
//  2. Identical snapshots are skipped (the clock ticks every second; data rarely changes).
//  3. Saves run one after another, in order.
//  4. First run on the database: the state the app kept in WebView storage is loaded instead,
//     saved into SQLite, and the old copy is kept aside as "<name>.migrated".
import { invoke } from "@tauri-apps/api/core";
import type { StateStorage } from "zustand/middleware";
import { isDesktop } from "./env";

let ready = false;
let lastSaved: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Call once the persisted state has been applied; from then on, changes are saved. */
export function markStorageReady() {
  ready = true;
}

/** Fired when a save fails, so the UI can tell the user. */
export const SAVE_ERROR_EVENT = "app-save-error";

const desktopStorage: StateStorage = {
  getItem: async (name) => {
    const fromDb = await invoke<string | null>("load_state");
    if (fromDb) return fromDb;
    return localStorage.getItem(name); // migrate what was saved before the database existed
  },
  setItem: (name, value) => {
    if (!ready || value === lastSaved) return;
    lastSaved = value;
    queue = queue
      .then(() => invoke("save_state", { snapshot: value }))
      .then(() => {
        const legacy = localStorage.getItem(name);
        if (legacy !== null) {
          localStorage.setItem(`${name}.migrated`, legacy);
          localStorage.removeItem(name);
        }
      })
      .catch((err) => {
        lastSaved = null; // retry on the next change
        console.error("save failed", err);
        window.dispatchEvent(new CustomEvent(SAVE_ERROR_EVENT, { detail: String(err) }));
      });
  },
  removeItem: () => {},
};

const browserStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    if (ready && value !== lastSaved) {
      lastSaved = value;
      localStorage.setItem(name, value);
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
};

export const appStorage: StateStorage = isDesktop ? desktopStorage : browserStorage;
