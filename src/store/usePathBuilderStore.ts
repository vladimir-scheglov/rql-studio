import { create } from "zustand";
import type { PathModel } from "../path-builder";

interface PathBuilderState {
  open: boolean;
  /** Сущность, для которой строится правило */
  startEntityFqid: string | null;
  editingNodeId: string | null;

  openBuilder: (entityFqid?: string) => void;
  openForNode: (nodeId: string, path: PathModel) => void;
  closeBuilder: () => void;
}

export const usePathBuilderStore = create<PathBuilderState>((set) => ({
  open: false,
  startEntityFqid: null,
  editingNodeId: null,

  openBuilder: (entityFqid) =>
    set({
      open: true,
      startEntityFqid: entityFqid ?? null,
      editingNodeId: null, // ← ключевое
    }),

  openForNode: (nodeId, path) =>
    set({
      open: true,
      editingNodeId: nodeId,
      startEntityFqid: path.startEntityFqid,
    }),

  closeBuilder: () =>
    set({
      open: false,
      editingNodeId: null,
      startEntityFqid: null,
    }),
}));
