import { useEditorStore } from "../../store/useEditorStore";

export type CompletionKind =
  | { type: "root" }
  | { type: "after-at" }
  | { type: "after-doc-dot"; entityFqid: string }
  | { type: "after-entity-dot"; entityFqid: string }
  | { type: "after-linkage-dot"; linkageFqid: string }
  | { type: "after-e-dot"; entityFqid: string }
  | { type: "after-equals"; attributeRef: string }
  | { type: "argument"; functionName: string };

export function detectContext(textBeforeCursor: string): CompletionKind {
  const trimmed = textBeforeCursor.replace(/\s+$/, "");

  // @link_X. или @e_X.
  const linkageDotMatch = trimmed.match(/@(link_[\w]+)\.(\w*)$/);
  if (linkageDotMatch) {
    // Возвращаем имя псевдонима, провайдер сам резолвит
    return { type: "after-linkage-dot", linkageFqid: linkageDotMatch[1] };
  }

  const eDotMatch = trimmed.match(/@(e_[\w]+)\.(\w*)$/);
  if (eDotMatch) {
    return { type: "after-e-dot", entityFqid: eDotMatch[1] };
  }

  const eqMatch = trimmed.match(/(@[\w.]*[\w]|[\w]+)\s*[=!<>]+\s*$/);
  if (eqMatch) {
    return { type: "after-equals", attributeRef: eqMatch[1] };
  }

  const dotMatch = trimmed.match(/@([A-Za-z_][\w.]*)\.(\w*)$/);
  if (dotMatch) {
    const aliasOrEntity = dotMatch[1];
    if (aliasOrEntity === "doc") {
      const ctx = useEditorStore.getState().context;
      const entityFqid = "entityFqid" in ctx ? ctx.entityFqid : undefined;
      if (entityFqid) return { type: "after-doc-dot", entityFqid };
    }
    return { type: "after-entity-dot", entityFqid: aliasOrEntity };
  }

  // После @
  if (/@\w*$/.test(trimmed)) {
    return { type: "after-at" };
  }

  // После имени функции и открытой скобки
  const fnMatch = trimmed.match(/([A-Za-z_][\w]*)\(\s*\w*$/);
  if (fnMatch) {
    return { type: "argument", functionName: fnMatch[1] };
  }

  return { type: "root" };
}
