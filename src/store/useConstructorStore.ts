import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  emptyGroup,
  type ConditionNode,
  type GroupNode,
} from "../constructor/types";
import type { DataRuleEffect } from "../constructor/export-yaml";

const HISTORY_LIMIT = 50;

interface ConstructorState {
  root: GroupNode;
  past: GroupNode[];
  future: GroupNode[];

  setRoot: (r: GroupNode, options?: { skipHistory?: boolean }) => void;
  updateNode: (
    id: string,
    updater: (n: ConditionNode) => ConditionNode,
  ) => void;
  removeNode: (id: string) => void;
  addChild: (parentId: string, child: ConditionNode) => void;
  reset: () => void;

  setRootWithUndo: (r: GroupNode) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useConstructorStore = create<ConstructorState>()(
  persist(
    (set, get) => {
      /** Внутренний помощник: применяет новый root с сохранением истории */
      const applyWithHistory = (next: GroupNode) => {
        const prev = get().root;
        // Не пишем в историю, если ничего не изменилось
        if (JSON.stringify(prev) === JSON.stringify(next)) {
          return;
        }
        const past = [...get().past, prev].slice(-HISTORY_LIMIT);
        set({
          root: next,
          past,
          future: [],
        });
      };

      return {
        root: emptyGroup("AND"),
        past: [],
        future: [],

        setRoot: (root, options) => {
          if (options?.skipHistory) {
            set({ root });
            return;
          }
          applyWithHistory(root);
        },

        setRootWithUndo: (root) => {
          // То же, что setRoot, но семантически отдельное имя
          // для «импорта из кода». Отличие — не нужно, но читается легче.
          applyWithHistory(root);
        },

        updateNode: (id, updater) =>
          applyWithHistory(replaceNode(get().root, id, updater) as GroupNode),

        removeNode: (id) =>
          applyWithHistory(removeNodeById(get().root, id) as GroupNode),

        addChild: (parentId, child) =>
          applyWithHistory(
            addChildToGroup(get().root, parentId, child) as GroupNode,
          ),

        reset: () => {
          applyWithHistory(emptyGroup("AND"));
          set({ past: [], future: [] });
        },

        undo: () => {
          const past = get().past;
          if (past.length === 0) return;
          const prev = past[past.length - 1];
          const nextPast = past.slice(0, -1);
          const nextFuture = [get().root, ...get().future].slice(
            0,
            HISTORY_LIMIT,
          );
          set({
            root: prev,
            past: nextPast,
            future: nextFuture,
          });
        },

        redo: () => {
          const future = get().future;
          if (future.length === 0) return;
          const next = future[0];
          const nextFuture = future.slice(1);
          const nextPast = [...get().past, get().root].slice(-HISTORY_LIMIT);
          set({
            root: next,
            past: nextPast,
            future: nextFuture,
          });
        },

        canUndo: () => get().past.length > 0,
        canRedo: () => get().future.length > 0,
      };
    },
    {
      name: "rql-studio-constructor",
      // Историю НЕ сохраняем — она привязана к текущей сессии
      partialize: (state) => ({ root: state.root }),
    },
  ),
);

// --- helpers -------------------------------------------------------------

function replaceNode(
  node: ConditionNode,
  id: string,
  updater: (n: ConditionNode) => ConditionNode,
): ConditionNode {
  if (node.id === id) return updater(node);
  if (node.kind === "group") {
    return {
      ...node,
      children: node.children.map((c) => replaceNode(c, id, updater)),
    };
  }
  return node;
}

function removeNodeById(node: ConditionNode, id: string): ConditionNode {
  if (node.kind === "group") {
    return {
      ...node,
      children: node.children
        .filter((c) => c.id !== id)
        .map((c) => removeNodeById(c, id)),
    };
  }
  return node;
}

function addChildToGroup(
  node: ConditionNode,
  parentId: string,
  child: ConditionNode,
): ConditionNode {
  if (node.id === parentId && node.kind === "group") {
    return { ...node, children: [...node.children, child] };
  }
  if (node.kind === "group") {
    return {
      ...node,
      children: node.children.map((c) => addChildToGroup(c, parentId, child)),
    };
  }
  return node;
}
