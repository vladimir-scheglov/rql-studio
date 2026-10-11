import type { SchemaIssue, ValidationResult } from "../schema/validate-schema";

export interface ValidationReportInput {
  result: ValidationResult;
  domainNames: Map<string, string>;
}

export function buildValidationReportMarkdown({
  result,
  domainNames,
}: ValidationReportInput): string {
  const lines: string[] = [];

  lines.push("# Отчёт валидации схем");
  lines.push("");
  lines.push(`_Создан: ${new Date().toISOString()}_`);
  lines.push("");

  // --- Сводка ---
  lines.push("## Сводка");
  lines.push("");
  lines.push(`- **Всего проблем:** ${result.stats.total}`);
  lines.push(`- **⛔ Ошибок:** ${result.stats.errors}`);
  lines.push(`- **⚠ Предупреждений:** ${result.stats.warnings}`);
  lines.push(`- **ℹ Информации:** ${result.stats.infos}`);
  lines.push("");

  if (result.issues.length === 0) {
    lines.push("**Проблем не найдено.**");
    return lines.join("\n");
  }

  // --- Группировка по домену ---
  const grouped = new Map<string, SchemaIssue[]>();
  for (const issue of result.issues) {
    const list = grouped.get(issue.domainId) ?? [];
    list.push(issue);
    grouped.set(issue.domainId, list);
  }

  // --- Содержание ---
  lines.push("## Содержание");
  lines.push("");
  for (const [domainId, issues] of grouped) {
    const name = domainNames.get(domainId) ?? domainId;
    const anchor = slugifyForToc(`${name} (${issues.length})`);
    lines.push(`- [${name} (${issues.length})](#${anchor})`);
  }
  lines.push("");

  // --- Проблемы по доменам ---
  for (const [domainId, issues] of grouped) {
    const name = domainNames.get(domainId) ?? domainId;
    lines.push(`## ${name} (${issues.length})`);
    lines.push("");
    lines.push(`**FQID:** \`${domainId}\``);
    lines.push("");

    // Сортируем: сначала ошибки, потом предупреждения, потом инфо
    const sorted = [...issues].sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    for (const issue of sorted) {
      const icon =
        issue.severity === "error"
          ? "⛔"
          : issue.severity === "warning"
            ? "⚠"
            : "ℹ";
      lines.push(`### ${icon} ${issue.code}`);
      lines.push("");
      lines.push(issue.message);
      lines.push("");

      const targetInfo = formatTarget(issue);
      if (targetInfo) {
        lines.push(`**Где:** ${targetInfo}`);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function formatTarget(issue: SchemaIssue): string {
  switch (issue.target.kind) {
    case "entity":
      return `сущность \`${issue.target.fqid}\``;
    case "linkage":
      return `связь \`${issue.target.fqid}\``;
    case "attribute":
      return `атрибут \`${issue.target.fqid}\``;
    case "rule":
      return `правило \`${issue.target.ruleId}\``;
    case "sequence":
      return `последовательность \`${issue.target.sequenceId}\``;
    case "dataType":
      return `тип данных \`${issue.target.dataTypeId}\``;
    case "domain":
      return `домен \`${issue.target.domainId}\``;
  }
}

function slugifyForToc(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
