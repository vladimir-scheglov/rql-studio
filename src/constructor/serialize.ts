import type {
  GroupNode,
  LeafNode,
  LeafValue,
  ConditionNode,
  LinkageNode,
  PathNode,
} from "./types";
import type { SymbolTable } from "../schema/symbol-table";

export function serializeCondition(
  node: ConditionNode,
  table: SymbolTable,
): string {
  return serializeNode(node, 0, table);
}

function serializeNode(
  node: ConditionNode,
  depth: number,
  table: SymbolTable,
): string {
  if (node.kind === "group") return serializeGroup(node, depth, table);
  if (node.kind === "linkage") return serializeLinkage(node, table);
  if (node.kind === "path") return serializePath(node);
  return serializeLeaf(node);
}

function serializePath(node: PathNode): string {
  return node.cachedRql.trim();
}

function serializeGroup(
  node: GroupNode,
  depth: number,
  table: SymbolTable,
): string {
  const childrenCount = node.children.length;

  const parts = node.children
    .map((c) => {
      const text = serializeNode(c, depth + 1, table);
      if (!text) return null;

      // Оборачиваем linkage в скобки, если у группы больше одного
      // ребёнка. Иначе AND/OR снаружи сливается с WHERE внутри SELECT.
      if (c.kind === "linkage" && childrenCount > 1) {
        return `(${text})`;
      }
      return text;
    })
    .filter((s): s is string => Boolean(s));

  if (parts.length === 0) return "";

  if (node.operator === "NOT") {
    return `NOT (${parts.join(" AND ")})`;
  }

  const joined = parts.join(` ${node.operator} `);
  return depth === 0 ? joined : `(${joined})`;
}
function serializeLeaf(node: LeafNode): string {
  return serializeLeafOnAlias(node, null);
}

function serializeLeafOnAlias(node: LeafNode, alias: string | null): string {
  if (!node.attribute) return "";
  const attr = alias ? `${alias}.${node.attribute}` : node.attribute;

  switch (node.operator) {
    case "IS NULL":
      return `${attr} IS NULL`;
    case "IS NOT NULL":
      return `${attr} IS NOT NULL`;
    case "IN": {
      const values = node.values.filter((v) => !isValueEmpty(v));
      if (values.length === 0) return "";
      const items = values.map(serializeValue).join(", ");
      return `${attr} IN SELECT(UNNEST(ARRAY(${items})))`;
    }
    case "BETWEEN": {
      const [a, b] = node.values;
      if (!a || !b || isValueEmpty(a) || isValueEmpty(b)) return "";
      return `${attr} BETWEEN ${serializeValue(a)} AND ${serializeValue(b)}`;
    }
    case "HAS": {
      if (!node.value || isValueEmpty(node.value)) return "";
      return `has(${attr}, ${serializeValue(node.value)})`;
    }
    default: {
      if (!node.value || isValueEmpty(node.value)) return "";
      return `${attr} ${node.operator} ${serializeValue(node.value)}`;
    }
  }
}

function serializeLinkage(node: LinkageNode, table: SymbolTable): string {
  if (!node.linkageFqid) return "";
  const linkage = table.linkages.get(node.linkageFqid);
  if (!linkage) return "";

  const shortId = linkage.id;
  const alias = `@link_${shortId}`;
  const condition = `eq(${alias}.side${node.side}, @doc.id)`;

  switch (node.mode) {
    case "exists":
      return `SELECT(count(id), FROM('current', @${shortId}, ${alias}), WHERE(${condition})) > 0`;

    case "not-exists":
      return `SELECT(count(id), FROM('current', @${shortId}, ${alias}), WHERE(${condition})) = 0`;

    case "linkage-attribute": {
      if (!node.nested || !node.nested.attribute) return "";
      const leafExpr = serializeLeafOnAlias(node.nested, alias);
      if (!leafExpr) return "";
      return `SELECT join('current', @${shortId}, ${alias}, ON(${condition})) WHERE ${leafExpr}`;
    }

    case "entity-attribute": {
      if (!node.nested || !node.nested.attribute) return "";
      if (!node.targetEntityFqid) return "";
      const otherSide = node.side === "1" ? "2" : "1";
      const targetShort =
        node.targetEntityFqid.split("/")[1] ?? node.targetEntityFqid;
      const entityAlias = `@e_${shortId}`;
      const leafExpr = serializeLeafOnAlias(node.nested, entityAlias);
      if (!leafExpr) return "";
      return [
        `SELECT`,
        `  join('current', @${shortId}, ${alias}, ON(${condition})),`,
        `  join('current', @${targetShort}, ${entityAlias}, ON(eq(${alias}.side${otherSide}, ${entityAlias}.id)))`,
        `WHERE ${leafExpr}`,
      ].join(" ");
    }
  }
}

export function serializeValue(v: LeafValue): string {
  switch (v.kind) {
    case "string":
      return `'${v.value.replace(/'/g, "''")}'`;
    case "number":
      return String(v.value);
    case "boolean":
      return v.value ? "true" : "false";
    case "enum":
      return `@${v.enumId}.${v.valueId}`;
    case "workflow":
      return `@${v.workflowId}.${v.statusId}`;
    case "system-date":
      return `@${v.which}`;
    case "system-user":
      return `@CurrentUser.${v.which}`;
    case "attribute":
      return `@doc.${v.attribute}`;
  }
}

function isValueEmpty(v: LeafValue): boolean {
  if (v.kind === "string") return v.value.trim() === "";
  if (v.kind === "number") return Number.isNaN(v.value);
  if (v.kind === "enum") return !v.enumId || !v.valueId;
  if (v.kind === "workflow") return !v.workflowId || !v.statusId;
  return false;
}
