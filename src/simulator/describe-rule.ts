import type { DataRule, DomainSchema } from "../schema/types";
import type { SymbolTable, ResolvedEntity } from "../schema/symbol-table";
import { parseRql } from "../rql/parser";
import { importFromRql } from "../constructor/import";
import { describeCondition } from "../constructor/describe";

export interface RuleDescription {
  /** Условие на русском или 'применяется ко всем объектам' */
  condition: string;
  /** Что делает правило: 'становится обязательным', 'скрывается', ... */
  effect: string;
  /** Атрибуты, на которые влияет правило */
  targetAttributes: string[];
  /** Ошибка парсинга условия, если была */
  error?: string;
}

// =========================================================================

const EFFECT_LABELS: Record<string, string> = {
  required: "становится обязательным",
  hidden: "скрывается",
  readonly: "становится доступным только для чтения",
  default: "получает значение по умолчанию",
  allowed: "ограничивается допустимыми значениями",
};

const EFFECT_VERBS: Record<string, string> = {
  required: "требует заполнения",
  hidden: "скрывает",
  readonly: "блокирует редактирование",
  default: "подставляет значение",
  allowed: "ограничивает",
};

// =========================================================================

export function describeDataRule(
  rule: DataRule,
  table: SymbolTable,
  domain: DomainSchema,
  entityFqid: string,
): RuleDescription {
  const targetAttributes = (rule.rule?.attributes ?? []).map(
    (a) => a.attribute,
  );

  const result: RuleDescription = {
    condition: "применяется ко всем объектам",
    effect: describeEffect(rule, targetAttributes, table, domain, entityFqid),
    targetAttributes,
  };

  // Разбираем условие
  const condStr = extractCondition(rule.condition);
  if (condStr === "true" || condStr === "" || condStr === undefined) {
    return result;
  }

  try {
    const { ast, parseErrors } = parseRql(`!rql ${condStr}`);
    if (!ast || parseErrors.length > 0) {
      result.error = parseErrors.map((e: any) => e.message).join("; ");
      return result;
    }

    const { root } = importFromRql(ast, table, domain.id, entityFqid);
    if (!root) {
      result.error = "Не удалось восстановить условие";
      return result;
    }

    const text = describeCondition(root, table, domain.id, entityFqid);
    // Убираем заголовок «Все условия выполнены:» — он избыточен в контексте
    result.condition = cleanConditionText(text);
  } catch (e: any) {
    result.error = e.message ?? String(e);
  }

  return result;
}

// =========================================================================

function extractCondition(condition: unknown): string {
  if (condition === true) return "true";
  if (typeof condition === "string") {
    return condition.replace(/^!rql\s*/i, "").trim();
  }
  if (condition && typeof condition === "object") {
    const c = condition as any;
    if (typeof c.value === "string") return c.value.trim();
    if (c.value === true) return "true";
  }
  return "";
}

/**
 * Убирает лишние заголовки из вывода describeCondition:
 *  - «Все условия выполнены:\n  • A\n  • B» → «A и B»
 *  - «Хотя бы одно из условий выполнено:\n  • A\n  • B» → «A или B»
 */
function cleanConditionText(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Определяем тип группы по заголовку
  const first = lines[0] ?? "";
  let joiner = "";
  let startIdx = 0;

  if (first.startsWith("Все условия")) {
    joiner = " и ";
    startIdx = 1;
  } else if (first.startsWith("Хотя бы одно")) {
    joiner = " или ";
    startIdx = 1;
  } else {
    // Простое условие — возвращаем как есть
    return text;
  }

  const items = lines
    .slice(startIdx)
    .map((l) => l.replace(/^•\s*/, "").replace(/^НЕ:\s*/, "НЕ "));

  if (items.length === 0) return text;
  if (items.length === 1) return items[0];

  return items.join(joiner);
}

function describeEffect(
  rule: DataRule,
  targetAttributes: string[],
  table: SymbolTable,
  domain: DomainSchema,
  entityFqid: string,
): string {
  const effect = rule.rule?.effect ?? "";
  const label = EFFECT_LABELS[effect] ?? effect ?? "не задан";

  if (targetAttributes.length === 0) {
    return `Эффект: ${label}`;
  }

  // Получаем человекочитаемые имена атрибутов
  const names = targetAttributes.map((id) => {
    const entity = table.entities.get(entityFqid);
    const attr = entity?.attributes.get(id);
    return attr?.name ?? id;
  });

  return `Атрибут${names.length > 1 ? "ы" : ""} ${names
    .map((n) => `«${n}»`)
    .join(", ")} ${label}`;
}

export function describeEffectShort(rule: DataRule): string {
  const effect = rule.rule?.effect ?? "";
  const verb = EFFECT_VERBS[effect] ?? effect;
  return verb;
}
