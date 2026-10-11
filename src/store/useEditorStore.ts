import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSchemaStore } from "./useSchemaStore";

export type EditorContext =
  | { kind: "condition"; entityFqid: string }
  | { kind: "constraint"; entityFqid: string; attributeId: string }
  | { kind: "expression"; entityFqid: string; attributeId?: string }
  | { kind: "policy" }
  | { kind: "free"; entityFqid?: string };

export type WorkspaceTab = "code" | "builder" | "diagram" | "simulator";

interface EditorState {
  context: EditorContext;
  value: string;
  activeTab: WorkspaceTab;

  setContext: (ctx: EditorContext) => void;
  setValue: (v: string) => void;
  setActiveTab: (t: WorkspaceTab) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      context: { kind: "free" },
      value: "!rql ",
      activeTab: "code",

      setContext: (context) => set({ context }),
      setValue: (value) => set({ value }),
      setActiveTab: (activeTab) => set({ activeTab }),
    }),
    {
      name: "rql-studio-editor",
      partialize: (state) => ({
        value: state.value,
        activeTab: state.activeTab,
        context: state.context,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Проверяем, что сущность из context есть в схеме.
        // Если нет — сбрасываем context в 'free'.
        const symbolTable = useSchemaStore.getState().symbolTable;
        if (!symbolTable) {
          state.context = { kind: "free" };
          return;
        }

        const ctx = state.context as any;
        const entityFqid: string | undefined = ctx?.entityFqid;
        if (entityFqid && !symbolTable.entities.has(entityFqid)) {
          state.context = { kind: "free" };
        }
      },
    },
  ),
);
