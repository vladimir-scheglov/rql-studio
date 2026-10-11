import type { PathModel } from "../path-builder/types";

export type ConditionNode = GroupNode | LeafNode | LinkageNode | PathNode;

export interface PathNode {
  id: string;
  kind: "path";
  /** Путь, построенный в Path Builder */
  path: PathModel;
  /** Кэш RQL-выражения — чтобы не генерировать при каждом рендере */
  cachedRql: string;
  /** Пользовательское название для отображения в дереве */
  label?: string;
}

export interface GroupNode {
  id: string;
  kind: "group";
  operator: "AND" | "OR" | "NOT";
  children: ConditionNode[];
}

export interface LeafNode {
  id: string;
  kind: "leaf";
  attribute: string;
  operator: LeafOperator;
  value: LeafValue | null;
  values: LeafValue[]; // для IN и BETWEEN
}

export type LeafOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "IN"
  | "LIKE"
  | "IS NULL"
  | "IS NOT NULL"
  | "BETWEEN"
  | "HAS";

export type LeafValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "enum"; enumId: string; valueId: string }
  | { kind: "workflow"; workflowId: string; statusId: string }
  | {
      kind: "system-date";
      which: "CurrentDate" | "CurrentTime" | "CurrentTimestamp";
    }
  | { kind: "system-user"; which: "id" | "username" }
  | { kind: "attribute"; attribute: string };

/**
 * Узел для работы со связями.
 *
 * Примеры:
 *  - Проверить наличие связи:     exists = true,  nested = null
 *  - Проверить отсутствие:        exists = false, nested = null
 *  - Условие на атрибут связи:    exists = true,  target='linkage', nested = leaf на атрибут связи
 *  - Условие на связанную сущность: exists = true, target='entity', nested = leaf на атрибут связанной сущности
 */
export interface LinkageNode {
  id: string;
  kind: "linkage";
  linkageFqid: string; // id связи из schema
  side: "1" | "2"; // какая сторона содержит текущий объект
  /** Сущность, к которой идёт связь со стороны, противоположной текущему объекту */
  targetEntityFqid: string;
  /** Что проверяем: наличие связи или атрибуты */
  mode: "exists" | "not-exists" | "linkage-attribute" | "entity-attribute";
  /** Для режимов linkage-attribute / entity-attribute — вложенное условие на атрибут */
  nested: LeafNode | null;
}

let idCounter = 0;
export function nextId(prefix = "n"): string {
  return `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

export function emptyGroup(operator: "AND" | "OR" = "AND"): GroupNode {
  return { id: nextId("g"), kind: "group", operator, children: [] };
}

export function emptyLeaf(attribute = ""): LeafNode {
  return {
    id: nextId("l"),
    kind: "leaf",
    attribute,
    operator: "=",
    value: null,
    values: [],
  };
}

export function emptyLinkage(): LinkageNode {
  return {
    id: nextId("lk"),
    kind: "linkage",
    linkageFqid: "",
    side: "1",
    targetEntityFqid: "",
    mode: "exists",
    nested: null,
  };
}

export function emptyPathNode(): PathNode {
  return {
    id: nextId("pn"),
    kind: "path",
    path: { startEntityFqid: "", steps: [] },
    cachedRql: "",
  };
}