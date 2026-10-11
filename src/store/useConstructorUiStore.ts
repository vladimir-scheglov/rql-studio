import { create } from "zustand";
import type { UsageLocation } from "../constructor/find-usages";
import type { IssuesMap } from "../constructor/validate";

// --- Типы ----------------------------------------------------------------

/** Выделение в инспекторе: либо узел дерева, либо токен из редактора */
export type InspectorSelection =
  | { kind: "tree-node"; id: string }
  | { kind: "code-token"; token: CodeToken }
  | { kind: "linkage"; fqid: string }
  | null;

/** Токен из редактора — то, что мы распознали при клике */
export interface CodeToken {
  /** '@doc', '@e_X', '@link_X', '@enumX', '@IncUrgency' */
  alias?: string;
  /** атрибут после alias — 'subject', 'value', 'side1' и т.д. */
  attribute?: string;
  /** имя функции — 'hasRole', 'join', 'SELECT' и т.д. */
  functionName?: string;
}

interface ConstructorUiState {
  // --- Свернуть/развернуть ---
  collapsed: Record<string, boolean>;
  toggleCollapsed: (id: string) => void;
  collapseAll: (ids: string[]) => void;
  expandAll: () => void;

  // --- Выделение в инспекторе ---
  selection: InspectorSelection;
  selectTreeNode: (id: string | null) => void;
  selectCodeToken: (token: CodeToken | null) => void;
  clearSelection: () => void;

  // --- Проблемы в дереве ---
  issues: IssuesMap;
  setIssues: (issues: IssuesMap) => void;

  // --- Поиск вхождений атрибута ---
  usageSearchAttribute: string | null;
  usageResults: UsageLocation[];
  usageActiveIndex: number;
  setUsageSearch: (attribute: string | null, results: UsageLocation[]) => void;
  cycleUsage: (direction: 1 | -1) => void;
  clearUsageSearch: () => void;
  selectLinkage: (fqid: string | null) => void;
}

export const useConstructorUiStore = create<ConstructorUiState>((set, get) => ({
  // --- Свернуть/развернуть ---
  collapsed: {},
  toggleCollapsed: (id) => {
    const prev = get().collapsed;
    set({ collapsed: { ...prev, [id]: !prev[id] } });
  },
  collapseAll: (ids) => {
    const next: Record<string, boolean> = {};
    for (const id of ids) next[id] = true;
    set({ collapsed: next });
  },
  expandAll: () => set({ collapsed: {} }),

  // --- Выделение ---
  selection: null,
  selectTreeNode: (id) =>
    set({ selection: id ? { kind: "tree-node", id } : null }),
  selectCodeToken: (token) =>
    set({ selection: token ? { kind: "code-token", token } : null }),
  clearSelection: () => set({ selection: null }),

  // --- Проблемы ---
  issues: new Map(),
  setIssues: (issues) => set({ issues }),

  // --- Поиск вхождений ---
  usageSearchAttribute: null,
  usageResults: [],
  usageActiveIndex: -1,
  setUsageSearch: (attribute, results) =>
    set({
      usageSearchAttribute: attribute,
      usageResults: results,
      usageActiveIndex: results.length > 0 ? 0 : -1,
    }),
  cycleUsage: (direction) =>
    set((state) => {
      if (state.usageResults.length === 0) return state;
      const next =
        (state.usageActiveIndex + direction + state.usageResults.length) %
        state.usageResults.length;
      return { usageActiveIndex: next };
    }),
  clearUsageSearch: () =>
    set({
      usageSearchAttribute: null,
      usageResults: [],
      usageActiveIndex: -1,
    }),

  selectLinkage: (fqid) =>
    set({ selection: fqid ? { kind: "linkage", fqid } : null }),
}));
