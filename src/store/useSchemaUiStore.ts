import { create } from "zustand";

export type FocusTarget =
  | { kind: "entity"; fqid: string }
  | { kind: "linkage"; fqid: string }
  | null;

export type ExplorerMode = "entities" | "linkages" | "rules";

interface SchemaUiState {
  focusTarget: FocusTarget;
  focusNonce: number;
  explorerMode: ExplorerMode;

  focusOn: (target: FocusTarget) => void;
  clearFocus: () => void;
  setExplorerMode: (mode: ExplorerMode) => void;
}

export const useSchemaUiStore = create<SchemaUiState>((set, get) => ({
  focusTarget: null,
  focusNonce: 0,
  explorerMode: "entities",

  focusOn: (target) =>
    set({
      focusTarget: target,
      focusNonce: get().focusNonce + 1,
    }),

  clearFocus: () => set({ focusTarget: null }),

  setExplorerMode: (mode) => set({ explorerMode: mode }),
}));
