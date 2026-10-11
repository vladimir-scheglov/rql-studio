import type { SymbolTable } from "../schema/symbol-table";
import type { GroupNode } from "./types";
import { serializeCondition } from "./serialize";

export type DataRuleEffect =
  | "required"
  | "hidden"
  | "readonly"
  | "default"
  | "allowed";

export interface DataRuleExportOptions {
  id: string;
  name?: string;
  effect: DataRuleEffect;
  attribute?: string;
  message?: string;
  help?: string;
  /** Для allowed: RQL-выражение ограничения */
  constraint?: string;
  /** Для default: RQL-выражение для вычисления значения */
  expression?: string;
  /** Для default: статическое значение */
  value?: string;
}

/**
 * Формирует фрагмент YAML для блока dataRules схемы домена.
 */
export function buildDataRuleYaml(
  root: GroupNode,
  table: SymbolTable,
  domain: string,
  entityFqid: string,
  options: DataRuleExportOptions,
): string {
  let condition = serializeCondition(root, table);
  const entityId = entityFqid.split("/")[1] ?? entityFqid;

  // Пустое дерево = правило применяется всегда
  if (!condition.trim()) {
    condition = "true";
  }

  const lines: string[] = [];

  lines.push("dataRules:");
  lines.push(`  - id: ${options.id}`);

  if (options.name && options.name.trim()) {
    lines.push(`    name: ${yamlString(options.name)}`);
  }

  lines.push(`    target: entity`);
  lines.push(`    entity: ${entityId}`);

  // condition — одной строкой, если коротко; блочно, если много
  if (condition.length <= 100 && !condition.includes("\n")) {
    lines.push(`    condition: !rql ${condition}`);
  } else {
    lines.push(`    condition: !rql |`);
    for (const line of condition.split("\n")) {
      lines.push(`      ${line}`);
    }
  }

  // rule
  lines.push(`    rule:`);
  lines.push(`      effect: ${options.effect}`);

  // attributes — формируются ТОЛЬКО из options.attribute.
  // Дерево condition в это не вмешивается.
  if (options.attribute) {
    lines.push(`      attributes:`);
    lines.push(`        - attribute: ${options.attribute}`);

    if (options.value) {
      lines.push(`          value: ${options.value}`);
    }
    if (options.expression) {
      lines.push(`          expression: !rql ${options.expression}`);
    }
    if (options.constraint) {
      lines.push(`          constraint: !rql ${options.constraint}`);
    }
    if (options.message) {
      lines.push(`          message: ${yamlString(options.message)}`);
    }
    if (options.help) {
      lines.push(`          help: ${yamlString(options.help)}`);
    }
  }

  return lines.join("\n");
}

/** Экранирует строку для YAML, добавляя кавычки, если нужно */
function yamlString(value: string): string {
  if (
    /[:#[\]{}|>&*!?'",%@`]/.test(value) ||
    /^[\s-]/.test(value) ||
    /\s$/.test(value)
  ) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
