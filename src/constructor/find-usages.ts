import type { ConditionNode, LeafNode, LinkageNode, GroupNode } from "./types";

export interface UsagePath {
  /** id узла в дереве (leaf или linkage) */
  nodeId: string;
  /** Путь от корня до узла — для подсветки контекста */
  path: string[];
  /** Тип узла */
  kind: "leaf" | "linkage-nested";
  /** Что за атрибут там используется */
  attribute: string;
  /** Для nested leaf — id linkage-родителя, чтобы можно было развернуть */
  parentLinkageId?: string;
}

export interface UsageLocation {
  line: number;
  column: number;
  matchedText: string;
}

export function findAttributeUsagesInText(
  text: string,
  attribute: string,
): UsageLocation[] {
  if (!attribute || !text) return [];

  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // С префиксом: @alias.attr или Entity.attr
  const withPrefix = new RegExp(
    `(@[\\w]+(?:\\.[\\w]+)?\\.|\\b\\w+\\.)(${escaped})(?![\\w])`,
    "g",
  );

  // Голый атрибут — перед ним не буква/точка/@, после — не буква/точка
  const bare = new RegExp(`(?<![\\w.@])(${escaped})(?![\\w.])`, "g");

  const results: UsageLocation[] = [];
  const lines = text.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Сначала — с префиксом
    withPrefix.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = withPrefix.exec(line)) !== null) {
      const key = `${i}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        line: i + 1,
        column: m.index + 1,
        matchedText: m[0],
      });
    }

    // Потом — голый (совпадения с префиксом уже в seen)
    bare.lastIndex = 0;
    while ((m = bare.exec(line)) !== null) {
      const key = `${i}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        line: i + 1,
        column: m.index + 1,
        matchedText: m[0],
      });
    }
  }

  // Сортируем по позиции в тексте
  results.sort((a, b) => a.line - b.line || a.column - b.column);
  return results;
}

/**
 * Ищет в дереве все leaf-узлы, где используется указанный атрибут.
 * Атрибут сравнивается по полному значению поля `attribute`, включая
 * возможный префикс `linkageId.attr`.
 */
export function findAttributeUsages(
  root: ConditionNode,
  attribute: string,
): UsagePath[] {
  const result: UsagePath[] = [];
  walk(root, [], attribute, result, null);
  return result;
}

function walk(
  node: ConditionNode,
  path: string[],
  attribute: string,
  out: UsagePath[],
  parentLinkageId: string | null,
): void {
  if (node.kind === "group") {
    for (const child of node.children) {
      walk(child, [...path, node.id], attribute, out, parentLinkageId);
    }
    return;
  }

  if (node.kind === "leaf") {
    if (matchesAttribute(node, attribute)) {
      out.push({
        nodeId: node.id,
        path,
        kind: "leaf",
        attribute: node.attribute,
        parentLinkageId: parentLinkageId ?? undefined,
      });
    }
    return;
  }

  if (node.kind === "linkage") {
    // Проверяем nested leaf
    if (node.nested) {
      if (matchesAttribute(node.nested, attribute)) {
        out.push({
          nodeId: node.nested.id,
          path: [...path, node.id],
          kind: "linkage-nested",
          attribute: node.nested.attribute,
          parentLinkageId: node.id,
        });
      }
    }
    return;
  }
}

/**
 * Проверяет, соответствует ли атрибут узла искомому.
 *
 * Правила матчинга:
 *   - точное совпадение: "subject" === "subject"
 *   - вариант с префиксом: узел `Incident_Ioc.value` совпадает с
 *     искомым `value`, если в левой панели нажали на атрибут
 *     связанной сущности.
 */
function matchesAttribute(node: LeafNode, attribute: string): boolean {
  if (!node.attribute || !attribute) return false;
  if (node.attribute === attribute) return true;

  // Если атрибут с точкой — сравниваем по последней части
  if (node.attribute.includes(".")) {
    const [, tail] = node.attribute.split(".");
    if (tail === attribute) return true;
  }

  return false;
}
