import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  /** Правая панель (Инспектор) */
  inspectorOpen: boolean;
  /** Левая панель (Explorer) — на будущее */
  explorerOpen: boolean;

  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  toggleExplorer: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      inspectorOpen: true,
      explorerOpen: true,

      toggleInspector: () => set({ inspectorOpen: !get().inspectorOpen }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      toggleExplorer: () => set({ explorerOpen: !get().explorerOpen }),
    }),
    { name: "rql-studio-layout" },
  ),
);
