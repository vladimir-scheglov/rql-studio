import type { ConditionNode, GroupNode } from "./types";

/** Собирает id всех групп в дереве, включая корень */
export function collectGroupIds(node: ConditionNode): string[] {
  const result: string[] = [];
  function walk(n: ConditionNode) {
    if (n.kind === "group") {
      result.push(n.id);
      for (const child of n.children) walk(child);
    } else if (n.kind === "linkage" && n.nested) {
      walk(n.nested);
    }
  }
  walk(node);
  return result;
}
