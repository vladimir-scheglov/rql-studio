import type { DomainSchema, DataRule } from "../schema/types";
import type { SymbolTable } from "../schema/symbol-table";
import { parseRql } from "../rql/parser";
import { importFromRql } from "./import";
import type { GroupNode } from "./types";
import type { DataRuleEffect } from "./export-yaml";

export interface ParsedRule {
  root: GroupNode;
  effect: DataRuleEffect | null;
  ruleId: string;
  ruleName?: string;
  isUnconditional: boolean;
}

export interface ParseRuleResult {
  result: ParsedRule | null;
  errors: string[];
}

/**
 * Разбирает dataRule из схемы в дерево конструктора.
 *
 * Если у правила есть attribute — оборачиваем дерево в контекст этого
 * атрибута. Если нет — это правило на сущность целиком.
 */
export function parseDataRule(
  rule: DataRule,
  table: SymbolTable,
  domain: string,
  fallbackEntityFqid: string,
): ParseRuleResult {
  const errors: string[] = [];

  // Определяем сущность правила
  const entityId = rule.entity ?? "";
  const entityFqid = entityId ? `${domain}/${entityId}` : fallbackEntityFqid;

  if (!entityId) {
    errors.push("У правила не указана сущность (поле entity)");
    return { result: null, errors };
  }

  // Парсим condition
  const conditionRaw = extractConditionText(rule.condition);
  if (!conditionRaw) {
    errors.push("У правила отсутствует condition");
    return { result: null, errors };
  }

  // Условие "всегда истина" — возвращаем пустую группу
  if (conditionRaw === "true" || conditionRaw === "1") {
    const effect = normalizeEffect(rule.rule?.effect);
    return {
      result: {
        root: {
          id: "g_" + Date.now().toString(36),
          kind: "group",
          operator: "AND",
          children: [],
        },
        effect,
        ruleId: rule.id,
        ruleName: rule.name,
        isUnconditional: false,
      },
      errors: [],
    };
  }

  const { ast, parseErrors } = parseRql(`!rql ${conditionRaw}`);
  if (!ast || parseErrors.length > 0) {
    const msgs = parseErrors.map((e: any) => e.message ?? String(e)).join("\n");
    errors.push("Не удалось разобрать condition:\n" + msgs);
    return { result: null, errors };
  }

  const { root, errors: importErrors } = importFromRql(
    ast,
    table,
    domain,
    entityFqid,
  );

  if (!root) {
    errors.push(...importErrors);
    return { result: null, errors };
  }

  if (importErrors.length > 0) {
    errors.push(...importErrors);
  }

  const effect = normalizeEffect(rule.rule?.effect);

  return {
    result: {
      root,
      effect,
      ruleId: rule.id,
      ruleName: rule.name,
      isUnconditional: false,
    },
    errors,
  };
}

/**
 * Извлекает текст условия: строка, !rql с блочным скаляром,
 * или уже готовый текст из YAML-парсера.
 */
function extractConditionText(condition: unknown): string {
  // boolean true — правило применяется всегда
  if (condition === true) return "true";

  // string — уже готовое RQL-выражение
  if (typeof condition === "string") {
    return condition.replace(/^!rql\s*/i, "").trim();
  }

  // объект — например, если YAML был !rql | с блоком
  if (condition && typeof condition === "object") {
    const c = condition as any;
    if (typeof c.value === "string") return c.value.trim();
    if (c.value === true) return "true";
  }

  // number, null — тоже «всегда»
  if (typeof condition === "number" && condition === 1) return "true";

  return "";
}

function normalizeEffect(effect: unknown): DataRuleEffect | null {
  if (typeof effect !== "string") return null;
  const known: DataRuleEffect[] = [
    "required",
    "hidden",
    "readonly",
    "default",
    "allowed",
  ];
  return known.includes(effect as DataRuleEffect)
    ? (effect as DataRuleEffect)
    : null;
}
